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
  const MIN_DIFF_MS = 5 * 60 * 1000; // tối thiểu 5 phút
  const MAX_DIFF_MS = 1 * 60 * 60 * 1000; // tối đa 1 giờ

  const grouped = records.reduce((acc, rec, idx) => {
    const doctor = rec[doctorCol] || "Không rõ";
    if (!acc[doctor]) acc[doctor] = [];
    acc[doctor].push({
      ...rec,
      Trạng_thái: rec.Trạng_thái || "Chưa kiểm tra",
      Trùng_với: new Set(),
      _originalIndex: idx,
    });
    return acc;
  }, {});

  const updated = [];

  Object.keys(grouped).forEach((doctor) => {
    let group = grouped[doctor].sort(
      (a, b) => parseDate(a[startCol]) - parseDate(b[startCol])
    );

    // --- Bước 1: Phát hiện overlap theo giờ gốc ---
    for (let i = 0; i < group.length; i++) {
      const caA = group[i];
      const nameA = caA["TÊN BỆNH NHÂN"] || "";
      const startA = parseDate(caA[startCol]);
      const endA = parseDate(caA[endCol]);
      if (!startA || !endA) continue;

      for (let j = i + 1; j < group.length; j++) {
        const caB = group[j];
        const nameB = caB["TÊN BỆNH NHÂN"] || "";
        const startB = parseDate(caB[startCol]);
        const endB = parseDate(caB[endCol]);
        if (!startB || !endB) continue;

        if (startA < endB && endA > startB) {
          // ✅ Ghi nhận trùng giờ gốc
          if (nameB) caA.Trùng_với.add(nameB);
          if (nameA) caB.Trùng_với.add(nameA);

          caA.Trạng_thái = "⚠️ Ca bị trùng giờ với ca khác";
          caB.Trạng_thái = "⚠️ Ca bị trùng giờ với ca khác";
        }
      }
    }

    // --- Bước 2: Điều chỉnh giờ (nếu muốn), nhưng KHÔNG thay đổi Trùng_với ---
    for (let i = 0; i < group.length; i++) {
      const ca = group[i];
      const start = parseDate(ca[startCol]);
      const end = parseDate(ca[endCol]);
      if (!start || !end) continue;

      const diff = end - start;
      if (diff < MIN_DIFF_MS) {
        ca.Trạng_thái = "❌ Lỗi: Khoảng cách < 5 phút";
      } else if (diff > MAX_DIFF_MS) {
        ca.Trạng_thái = "⚠️ Cảnh báo: Khoảng cách quá dài";
      } else if (!ca.Trạng_thái.startsWith("⚠️") && !ca.Trạng_thái.startsWith("❌")) {
        ca.Trạng_thái = "✅ Hợp lệ";
      }
    }

    // Convert Set → chuỗi và loại bỏ self
    updated.push(
      ...group.map((ca) => {
        const self = ca["TÊN BỆNH NHÂN"] || "";
        ca.Trùng_với.delete(self);
        return {
          ...ca,
          Trùng_với: Array.from(ca.Trùng_với).join(", "),
        };
      })
    );
  });

  return updated.sort((a, b) => parseDate(a[startCol]) - parseDate(b[startCol]));
};
