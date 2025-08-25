/* eslint-disable no-unused-vars */

// ================== CẤU HÌNH ==================
const WORK_START_H = 8;
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

const dayMorningStart = (d) => setHM(d, WORK_START_H, 0); // 08:00
const dayMorningEnd = (d) => setHM(d, LUNCH_START_H, 0); // 12:00
const dayAfternoonStart = (d) => setHM(d, LUNCH_END_H, 0); // 13:00
const dayAfternoonEnd = (d) => setHM(d, WORK_END_H, 0); // 17:00

// ================== PARSE / FORMAT DATE ==================
export const parseDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;

  // Excel serial number
  if (typeof value === "number") {
    const utcDays = Math.floor(value - 25569);
    const utcValue = utcDays * 86400;
    const d = new Date(utcValue * 1000);

    const fractionalDay = value - Math.floor(value) + 1e-7;
    let totalSeconds = Math.floor(86400 * fractionalDay);
    const seconds = totalSeconds % 60;
    totalSeconds -= seconds;
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor(totalSeconds / 60) % 60;

    d.setHours(hours, minutes, seconds);
    return d;
  }

  // String date: mm/dd/yyyy hh:mm hoặc dd/mm/yyyy hh:mm
  if (typeof value === "string") {
    const [datePart, timePart = "00:00"] = value.trim().split(" ");
    const parts = datePart.split(/[/-]/).map(Number);

    let yyyy, mm, dd;
    if (parts[2] > 1900) {
      // mm/dd/yyyy
      [mm, dd, yyyy] = parts;
    } else {
      // dd/mm/yyyy
      [dd, mm, yyyy] = parts;
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
    .toLocaleString("en-US", {
      month: "2-digit",
      day: "2-digit",
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
        // 📌 Có trùng ca
        caB.Trùng_với = `BN: ${caA["TÊN BỆNH NHÂN"] || "?"} (${
          caA[startCol]
        } - ${caA[endCol]})`;

        if (!manualLocked) {
          // chỉnh tự động
          const duration = Math.max(5, Math.round((endB - startB) / MS));
          let newStart = new Date(endA.getTime() + bufferMS);
          let newEnd = new Date(newStart.getTime() + duration * MS);

          // Điều chỉnh theo giờ làm việc
          if (isDuringLunch(newStart)) newStart = dayAfternoonStart(newStart);
          if (isAfterWork(newStart))
            newStart = dayMorningStart(
              new Date(newStart.setDate(newStart.getDate() + 1))
            );
          newEnd = new Date(newStart.getTime() + duration * MS);

          caB[startCol] = normalizeDate(newStart);
          caB[endCol] = normalizeDate(newEnd);
          caB.Trạng_thái = "Đã chỉnh (tự động)";
        } else {
          // thủ công nhưng vẫn trùng
          caB.Trạng_thái = "Đã chỉnh (thủ công) – nhưng trùng ca";
        }
      } else {
        // 📌 Không trùng → luôn gán rõ trạng thái
        caB.Trạng_thái = "Hợp lệ (không trùng)";
        caB.Trùng_với = "";
      }
    }

    updated.push(...group);
  });

  return updated.sort((a, b) => {
    // Ưu tiên sắp theo mã bệnh nhân
    const idA = (a["MÃ BỆNH NHÂN"] || "").toLowerCase();
    const idB = (b["MÃ BỆNH NHÂN"] || "").toLowerCase();
    if (idA < idB) return -1;
    if (idA > idB) return 1;

    // Nếu cùng mã bệnh nhân thì sắp theo tên
    const patientA = (a["TÊN BỆNH NHÂN"] || "").toLowerCase();
    const patientB = (b["TÊN BỆNH NHÂN"] || "").toLowerCase();
    if (patientA < patientB) return -1;
    if (patientA > patientB) return 1;

    // Sau đó mới sắp theo bác sĩ
    const doctorA = (a[doctorCol] || "").toLowerCase();
    const doctorB = (b[doctorCol] || "").toLowerCase();
    if (doctorA < doctorB) return -1;
    if (doctorA > doctorB) return 1;

    // Cuối cùng: theo thời gian y lệnh
    return parseDate(a[startCol]) - parseDate(b[startCol]);
  });
};
