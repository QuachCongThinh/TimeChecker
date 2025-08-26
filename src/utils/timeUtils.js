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

// ================== SẮP XẾP GIỜ ==================
export const detectAndAdjustByDoctor = (
  records,
  startCol,
  endCol,
  doctorCol
) => {
  const MIN_DIFF_MS = 1 * 60 * 1000; // 1 phút
  const STANDARD_INTERVAL_MS = 5 * 60 * 1000; // 5 phút

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

    let prevEnd = null; // lưu Ngày Kết quả ca trước

    for (let i = 0; i < group.length; i++) {
      const ca = group[i];
      const yLenh = parseDate(ca["NGÀY Y LỆNH"]);
      let thYLenh = parseDate(ca[startCol]);
      let ketQua = parseDate(ca[endCol]);

      // Nếu ca không hợp lệ (trùng), cần điều chỉnh
      let needAdjust = false;
      if (prevEnd && thYLenh < new Date(prevEnd.getTime() + MIN_DIFF_MS))
        needAdjust = true;

      // Kiểm tra trùng với các ca trước và sau
      for (let j = 0; j < i; j++) {
        const other = group[j];
        const oStart = parseDate(other[startCol]);
        const oEnd = parseDate(other[endCol]);
        if (thYLenh < oEnd && ketQua > oStart) {
          needAdjust = true;
          ca.Trùng_với.add(other["TÊN BỆNH NHÂN"] || "");
          other.Trùng_với.add(ca["TÊN BỆNH NHÂN"] || "");
        }
      }

      if (!needAdjust) {
        // Nếu có trùng với ca khác thì cảnh báo
        if (ca.Trùng_với.size > 0) {
          ca.Trạng_thái = "⚠️ Ca bị trùng giờ";
        } else {
          ca.Trạng_thái = "✅ Hợp lệ";
        }
        prevEnd = ketQua;
        continue; // giữ nguyên ca hợp lệ
      }

      // --- Bắt đầu điều chỉnh ---
      thYLenh = new Date(yLenh.getTime() + STANDARD_INTERVAL_MS);
      ketQua = new Date(thYLenh.getTime() + STANDARD_INTERVAL_MS);

      // 1. Tránh trùng với ca trước
      if (prevEnd && thYLenh < new Date(prevEnd.getTime() + MIN_DIFF_MS)) {
        const shift = prevEnd.getTime() + MIN_DIFF_MS - thYLenh.getTime();
        thYLenh = new Date(thYLenh.getTime() + shift);
        ketQua = new Date(thYLenh.getTime() + STANDARD_INTERVAL_MS);
      }

      // 2. Tránh giờ trưa
      if (isDuringLunch(thYLenh)) {
        thYLenh = dayAfternoonStart(thYLenh);
        ketQua = new Date(thYLenh.getTime() + STANDARD_INTERVAL_MS);
      }

      // 3. Không vượt giờ làm việc
      if (ketQua > dayAfternoonEnd(ketQua)) {
        ca.Trạng_thái = "❌ Vượt giờ làm việc";
      } else {
        ca.Trạng_thái = "⚠️ Ca bị trùng giờ";
      }

      // 4. Gán giá trị chuẩn
      ca[startCol] = normalizeDate(thYLenh);
      ca[endCol] = normalizeDate(ketQua);
      ca["NGÀY Y LỆNH"] = normalizeDate(yLenh);

      prevEnd = ketQua;
    }

    // 5. Chuyển Trùng_với thành string
    updated.push(
      ...group.map((ca) => {
        const self = ca["TÊN BỆNH NHÂN"] || "";
        ca.Trùng_với.delete(self);
        ca.Trùng_với = Array.from(ca.Trùng_với).join(", ");

        // --- Cập nhật trạng thái theo yêu cầu ---
        if (ca.Trạng_thái === "❌ Vượt giờ làm việc") {
          // Giữ nguyên cảnh báo vượt giờ
        } else if (ca.Trùng_với) {
          ca.Trạng_thái = "⚠️ Ca bị trùng giờ";
        } else {
          ca.Trạng_thái = "✅ Hợp lệ";
        }

        return ca;
      })
    );
  });

  // 6. Sắp xếp lại theo giờ TH Y lệnh
  return updated.sort(
    (a, b) => parseDate(a[startCol]) - parseDate(b[startCol])
  );
};
