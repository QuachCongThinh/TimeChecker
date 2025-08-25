/* eslint-disable no-unused-vars */

// ================== CẤU HÌNH ==================
const WORK_START_H = 7;
const LUNCH_START_H = 12;
const LUNCH_END_H = 13;
const WORK_END_H = 17;
const GRACE_AFTER_DISCHARGE_MIN = 30; // phút

const MS = 60 * 1000;

// ================== TIME UTILS ==================
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
const isBeforeWork = (d) => d.getHours() < WORK_START_H;

const dayMorningStart = (d) => setHM(d, WORK_START_H, 0); // 07:00
const dayMorningEnd = (d) => setHM(d, LUNCH_START_H, 0); // 12:00
const dayAfternoonStart = (d) => setHM(d, LUNCH_END_H, 0); // 13:00
const dayAfternoonEnd = (d) => setHM(d, WORK_END_H, 0); // 17:00

// ================== PARSE / FORMAT DATE ==================
export const parseDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;

  // Excel serial number
  if (typeof value === "number") {
    // 25569 là số ngày từ 1899-12-31
    const d = new Date(Date.UTC(1899, 11, 30)); // 30 Dec 1899
    d.setUTCDate(d.getUTCDate() + Math.floor(value));
    const fractionalDay = value - Math.floor(value);
    const totalSeconds = Math.round(fractionalDay * 86400);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    d.setUTCHours(hours, minutes, seconds);
    return d;
  }

  // String date: mm/dd/yyyy hh:mm hoặc dd/mm/yyyy hh:mm
  if (typeof value === "string") {
    const [datePart, timePart = "00:00"] = value.trim().split(" ");
    const parts = datePart.split(/[/-]/).map(Number);

    let yyyy, mm, dd;
    if (parts[0] > 31) {
      // yyyy-mm-dd
      [yyyy, mm, dd] = parts;
    } else if (parts[2] > 31) {
      // dd/mm/yyyy
      [dd, mm, yyyy] = parts;
    } else {
      // mm/dd/yyyy
      [mm, dd, yyyy] = parts;
    }

    const [hh, mi = 0] = timePart.split(":").map(Number);
    return new Date(yyyy, mm - 1, dd, hh || 0, mi || 0, 0, 0);
  }

  return null;
};

export const normalizeDate = (value) => {
  const d = parseDate(value);
  if (!d || isNaN(d)) return "";
  return d
    .toLocaleString("en-GB", {
      // UK dùng dd/mm/yyyy
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
    .replace(",", "");
};

// ================== WINDOW & PREFERENCE ==================
const inferHalfDayPreference = (admit, discharge) => {
  const isMorning = (dt) => dt.getHours() < 12;
  if (isMorning(admit) && isMorning(discharge)) return "morning";
  if (!isMorning(admit) && !isMorning(discharge)) return "afternoon";
  return "any";
};

const getPatientWindow = (row) => {
  const admit = parseDate(row["NGÀY VÀO VIỆN"]) || new Date(1970, 0, 1);
  const discharge = parseDate(row["NGÀY RA VIỆN"]) || new Date(3000, 0, 1);
  return {
    admit,
    discharge,
    winStart: dClone(admit),
    winEnd: new Date(discharge.getTime() + GRACE_AFTER_DISCHARGE_MIN * MS),
  };
};

// ================== DETECT CỘT NGÀY ==================
export const detectDateColumns = (headers) => {
  let startCol = null;
  let endCol = null;

  headers.forEach((header) => {
    const h = header.toLowerCase();
    if (!startCol && h.includes("ngày th y lệnh")) startCol = header;
    if (!endCol && h.includes("ngày kết quả")) endCol = header;
  });

  return { startCol, endCol };
};

// ================== SẮP XẾP THEO BÁC SĨ ==================
export const detectAndAdjustByDoctor = (
  records,
  startCol,
  endCol,
  doctorCol
) => {
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

  const updated = [];

  Object.keys(grouped).forEach((doctor) => {
    let group = grouped[doctor].sort(
      (a, b) => parseDate(a[startCol]) - parseDate(b[startCol])
    );

    for (let i = 0; i < group.length - 1; i++) {
      const caA = group[i];
      const caB = group[i + 1];

      const endA = parseDate(caA[endCol]);
      let startB = parseDate(caB[startCol]);
      let endB = parseDate(caB[endCol]);
      const manualLocked = caB.Trạng_thái.includes("thủ công");

      const bufferMS = 1 * MS;

      if (startB < new Date(endA.getTime() + bufferMS)) {
        // 📌 Trùng ca
        caB.Trùng_với = `BN: ${caA["TÊN BỆNH NHÂN"] || "?"} (${
          caA[startCol]
        } - ${caA[endCol]})`;

        if (!manualLocked) {
          const duration = Math.max(5, Math.round((endB - startB) / MS));
          let newStart = new Date(endA.getTime() + bufferMS);
          let newEnd = new Date(newStart.getTime() + duration * MS);

          // Đẩy sang giờ trưa/chiều nếu cần
          if (isDuringLunch(newStart)) {
            newStart = dayAfternoonStart(newStart);
            newEnd = new Date(newStart.getTime() + duration * MS);
          }

          // Giới hạn max 17:00
          if (newEnd > dayAfternoonEnd(newEnd)) {
            newEnd = dayAfternoonEnd(newEnd);
            if (newStart >= dayAfternoonEnd(newStart)) {
              caB.Trạng_thái = "Không thể tự động sắp xếp (quá giờ chiều)";
              continue;
            }
          }

          caB[startCol] = normalizeDate(newStart);
          caB[endCol] = normalizeDate(newEnd);
          caB.Trạng_thái = "Đã chỉnh (tự động)";
        } else {
          caB.Trạng_thái = "Đã chỉnh (thủ công) – nhưng trùng ca";
        }
      } else {
        caB.Trạng_thái = "Hợp lệ (không trùng)";
        caB.Trùng_với = "";
      }
    }

    // Sắp xếp ca từ sáng → chiều
    const sortByTimeSlot = (a, b) => {
      const aDate = parseDate(a[startCol]);
      const bDate = parseDate(b[startCol]);
      const aSlot = aDate.getHours() < LUNCH_START_H ? 0 : 1;
      const bSlot = bDate.getHours() < LUNCH_START_H ? 0 : 1;
      if (aSlot !== bSlot) return aSlot - bSlot;
      return aDate - bDate;
    };

    group = group.sort(sortByTimeSlot);
    updated.push(...group);
  });

  return updated.sort((a, b) => {
    const idA = (a["MÃ BỆNH NHÂN"] || "").toLowerCase();
    const idB = (b["MÃ BỆNH NHÂN"] || "").toLowerCase();
    if (idA < idB) return -1;
    if (idA > idB) return 1;

    const patientA = (a["TÊN BỆNH NHÂN"] || "").toLowerCase();
    const patientB = (b["TÊN BỆNH NHÂN"] || "").toLowerCase();
    if (patientA < patientB) return -1;
    if (patientA > patientB) return 1;

    const doctorA = (a[doctorCol] || "").toLowerCase();
    const doctorB = (b[doctorCol] || "").toLowerCase();
    if (doctorA < doctorB) return -1;
    if (doctorA > doctorB) return 1;

    return parseDate(a[startCol]) - parseDate(b[startCol]);
  });
};
