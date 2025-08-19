/* eslint-disable no-unused-vars */
export const detectDateColumns = (headers) => {
  let startCol = null;
  let endCol = null;

  headers.forEach((header) => {
    const h = header.toLowerCase();
    if (!startCol && h.includes("ngày th y lệnh")) {
      startCol = header;
    }
    if (!endCol && h.includes("ngày kết quả")) {
      endCol = header;
    }
  });

  return { startCol, endCol };
};
// Các hằng số cấu hình
const WORK_START_H = 8;
const LUNCH_START_H = 12;
const LUNCH_END_H = 13;
const WORK_END_H = 17;
const GRACE_AFTER_DISCHARGE_MIN = 30; // cho phép lệch sau ra viện 30’

const MS = 60 * 1000;

// Utils giờ làm việc
const dClone = (d) => new Date(d.getTime());
const setHM = (d, h, m = 0) => {
  const nd = dClone(d);
  nd.setHours(h, m, 0, 0);
  return nd;
};
const isDuringLunch = (d) => d.getHours() === LUNCH_START_H;
const isAfterWork = (d) =>
  d.getHours() > WORK_END_H ||
  (d.getHours() === WORK_END_H && d.getMinutes() > 0);
const isBeforeWork = (d) =>
  d.getHours() < WORK_START_H ||
  (d.getHours() === WORK_START_H && d.getMinutes() < 0);

const dayMorningStart = (d) => setHM(d, WORK_START_H, 0); // 08:00
const dayMorningEnd = (d) => setHM(d, LUNCH_START_H, 0); // 12:00 (exclusive)
const dayAfternoonStart = (d) => setHM(d, LUNCH_END_H, 1); // 13:01
const dayAfternoonEnd = (d) => setHM(d, WORK_END_H, 0); // 17:00

// Ưu tiên khung giờ theo “buổi” của vào/ra viện
const inferHalfDayPreference = (admit, discharge) => {
  const isMorning = (dt) => dt.getHours() < 12;
  const admitMorning = isMorning(admit);
  const dischargeMorning = isMorning(discharge);
  if (admitMorning && dischargeMorning) return "morning";
  if (!admitMorning && !dischargeMorning) return "afternoon";
  return "any"; // trộn buổi → không cố ép
};

// Trả về {winStart, winEnd} – cửa thời gian cho bệnh nhân (có grace)
const getPatientWindow = (row) => {
  const admit =
    parseDate(row["NGÀY VÀO VIỆN"]) || new Date(1970, 0, 1, 0, 0, 0, 0);
  const discharge =
    parseDate(row["NGÀY RA VIỆN"]) || new Date(3000, 0, 1, 0, 0, 0, 0);
  const winStart = dClone(admit);
  const winEnd = new Date(discharge.getTime() + GRACE_AFTER_DISCHARGE_MIN * MS);
  return { admit, discharge, winStart, winEnd };
};

// Tìm mốc bắt đầu hợp lệ sớm nhất >= candidateStart theo ưu tiên buổi và giờ làm việc, trong phạm vi [winStart, winEnd]
const nextFeasibleStart = (candidateStart, preference, winStart, winEnd) => {
  let s = dClone(candidateStart);
  if (s < winStart) s = dClone(winStart);

  while (true) {
    // Nếu quá hạn cửa sổ → không còn chỗ
    if (s > winEnd) return null;

    // Điều chỉnh theo giờ làm việc/nghỉ trưa
    if (isDuringLunch(s)) s = dayAfternoonStart(s);
    else if (isBeforeWork(s)) s = dayMorningStart(s);
    else if (isAfterWork(s)) {
      // chuyển sang sáng ngày hôm sau
      const nextDay = new Date(
        s.getFullYear(),
        s.getMonth(),
        s.getDate() + 1,
        0,
        0,
        0,
        0
      );
      s = dayMorningStart(nextDay);
      continue;
    }

    // Áp ưu tiên buổi (chỉ “cố gắng” – không ép cứng)
    if (preference === "morning") {
      const mornStart = dayMorningStart(s);
      const mornEnd = dayMorningEnd(s);
      if (s < mornStart) s = mornStart;
      if (s >= mornEnd) s = dayAfternoonStart(s); // sáng hết → chuyển chiều (vẫn trong ngày)
    } else if (preference === "afternoon") {
      const aftStart = dayAfternoonStart(s);
      const aftEnd = dayAfternoonEnd(s);
      if (s < aftStart) s = aftStart;
      if (s >= aftEnd) {
        // hết chiều → đẩy sang sáng hôm sau
        const nextDay = new Date(
          s.getFullYear(),
          s.getMonth(),
          s.getDate() + 1,
          0,
          0,
          0,
          0
        );
        s = dayAfternoonStart(nextDay); // cố gắng chiều hôm sau
        // Nếu hôm sau không thể chiều (do sớm quá), vòng lặp sẽ tự điều chỉnh
      }
    }

    // Nếu sau điều chỉnh vượt cửa sổ → thử vòng sau (tức là sáng/chiều ngày tiếp theo)
    if (s > winEnd) return null;

    return s;
  }
};

const placeWithDuration = (start, durationMin, winStart, winEnd) => {
  let s = dClone(start);
  let e = new Date(s.getTime() + durationMin * MS);

  if (e > winEnd) return null;

  let exceeded = false;
  if (isAfterWork(e)) exceeded = true;

  return { start: s, end: e, exceeded };
};

export const detectAndAdjustByDoctor = (
  records,
  startCol,
  endCol,
  doctorCol
) => {
  const updated = [];

  const grouped = records.reduce((acc, rec, idx) => {
    const doctor = rec[doctorCol] || "Không rõ";
    if (!acc[doctor]) acc[doctor] = [];
    acc[doctor].push({
      ...rec,
      Trạng_thái: rec.Trạng_thái || "Không chỉnh",
      Trùng_với: "",
      _originalIndex: idx,
    });
    return acc;
  }, {});

  Object.keys(grouped).forEach((doctor) => {
    let group = grouped[doctor].sort(
      (a, b) => parseDate(a[startCol]) - parseDate(b[startCol])
    );

    let adjusted = true;
    while (adjusted) {
      adjusted = false;

      for (let i = 0; i < group.length - 1; i++) {
        const caA = group[i];
        const caB = group[i + 1];

        let endA = parseDate(caA[endCol]);
        let startB = parseDate(caB[startCol]);
        let endB = parseDate(caB[endCol]);
        const manualLocked = caB.Trạng_thái === "Đã chỉnh (thủ công)";

        // Nếu trùng ca
        if (startB < endA) {
          if (!manualLocked) {
            // Khoảng thời gian ca B
            const duration = Math.max(5, Math.round((endB - startB) / MS));

            // Bắt đầu sau ca A
            let newStart = new Date(endA.getTime() + 1 * MS);
            let newEnd = new Date(newStart.getTime() + duration * MS);

            // Tự động điều chỉnh vào khung giờ sáng/chiều
            if (isDuringLunch(newStart)) newStart = dayAfternoonStart(newStart);
            if (isAfterWork(newStart)) {
              // Nếu vượt giờ, không dời sang ngày hôm sau
              newStart = dayAfternoonEnd(newStart); // đặt ngay cuối giờ chiều
              // hoặc để null nếu không thể đặt
            }

            newEnd = new Date(newStart.getTime() + duration * MS);

            // Nếu end trùng giờ lunch, đẩy sang chiều
            if (
              newEnd > dayMorningEnd(newEnd) &&
              newEnd <= dayAfternoonStart(newEnd)
            ) {
              newEnd = dayAfternoonStart(newEnd);
            }

            // Nếu vượt giờ làm việc, cắt lại
            if (isAfterWork(newEnd)) newEnd = dayAfternoonEnd(newEnd);

            caB[startCol] = normalizeDate(newStart);
            caB[endCol] = normalizeDate(newEnd);
            caB.Trạng_thái = "Đã chỉnh (tự động) – tránh trùng & giờ làm việc";
            caB.Trùng_với = `BN: ${caA["TÊN BỆNH NHÂN"] || "?"} (${
              caA[startCol]
            } - ${caA[endCol]})`;

            adjusted = true;
          } else {
            caB.Trạng_thái = "Đã chỉnh (thủ công) – nhưng trùng ca";
            caB.Trùng_với = `BN: ${caA["TÊN BỆNH NHÂN"] || "?"} (${
              caA[startCol]
            } - ${caA[endCol]})`;
          }
        }
      }

      group.sort((a, b) => parseDate(a[startCol]) - parseDate(b[startCol]));
    }

    updated.push(...group);
  });

  return updated.sort((a, b) => {
    const doctorA = (a[doctorCol] || "").toLowerCase();
    const doctorB = (b[doctorCol] || "").toLowerCase();
    if (doctorA < doctorB) return -1;
    if (doctorA > doctorB) return 1;
    return parseDate(a[startCol]) - parseDate(b[startCol]);
  });
};

// utils/timeUtils.js
export const parseDate = (value) => {
  if (!value) return null;

  if (value instanceof Date) return value;

  // Trường hợp Excel serial number (ngày Excel lưu dạng số)
  if (typeof value === "number") {
    const utcDays = Math.floor(value - 25569);
    const utcValue = utcDays * 86400;
    const d = new Date(utcValue * 1000);

    const fractionalDay = value - Math.floor(value) + 0.0000001;
    let totalSeconds = Math.floor(86400 * fractionalDay);
    const seconds = totalSeconds % 60;
    totalSeconds -= seconds;
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor(totalSeconds / 60) % 60;

    d.setHours(hours, minutes, seconds);
    return d;
  }

  // Trường hợp là chuỗi mm/dd/yyyy hh:mm  ✅ FIXED
  if (typeof value === "string") {
    const parts = value.trim().split(" ");
    const datePart = parts[0];
    const timePart = parts[1] || "00:00";

    const [mm, dd, yyyy] = datePart.split(/[/-]/).map(Number); // đổi chỗ
    const [hh, mi] = timePart.split(":").map(Number);

    return new Date(yyyy, mm - 1, dd, hh || 0, mi || 0, 0, 0);
  }

  return null;
};

// Chuẩn hóa lại xuất ra mm/dd/yyyy hh:mm
export const normalizeDate = (value) => {
  const d = parseDate(value);
  if (!d || isNaN(d)) return "";

  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");

  return `${mm}/${dd}/${yyyy} ${hh}:${mi}`;
};
