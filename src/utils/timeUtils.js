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

export const detectAndAdjustByDoctor = (
  records,
  startCol,
  endCol,
  doctorCol
) => {
  const updated = [];

  // Nhóm theo bác sĩ
  const grouped = records.reduce((acc, rec, idx) => {
    const doctor = rec[doctorCol] || "Không rõ";
    if (!acc[doctor]) acc[doctor] = [];
    acc[doctor].push({
      ...rec,
      Trạng_thái: "Không chỉnh",
      "Trùng với bệnh nhân?": "",
      _originalIndex: idx,
    });
    return acc;
  }, {});

  const isInLunchBreak = (date) => date.getHours() === 12;

  Object.keys(grouped).forEach((doctor) => {
    const group = grouped[doctor].sort(
      (a, b) => parseDate(a[startCol]) - parseDate(b[startCol])
    );

    let latestEnd = null;

    for (let i = 0; i < group.length; i++) {
      let curStart = parseDate(group[i][startCol]);
      let curEnd = parseDate(group[i][endCol]);
      let changed = false;

      // Nếu start < latestEnd => dịch ra sau
      if (latestEnd && curStart <= latestEnd) {
        curStart = new Date(latestEnd.getTime() + 1 * 60 * 1000);
        changed = true;
      }

      // Đảm bảo ca >= 5 phút
      if ((curEnd - curStart) / (1000 * 60) < 5) {
        curEnd = new Date(curStart.getTime() + 5 * 60 * 1000);
        changed = true;
      }

      // Né giờ nghỉ trưa 12:00
      if (isInLunchBreak(curStart) || isInLunchBreak(curEnd)) {
        const afterLunch = new Date(curStart);
        afterLunch.setHours(13, 1, 0, 0); // sang 13:01
        curStart = afterLunch;
        curEnd = new Date(afterLunch.getTime() + 5 * 60 * 1000);
        changed = true;
      }

      // Normalize và đánh dấu
      group[i][startCol] = normalizeDate(curStart);
      group[i][endCol] = normalizeDate(curEnd);
      if (changed) group[i].Trạng_thái = "Đã chỉnh";

      latestEnd = curEnd;
    }

    updated.push(...group);
  });

  // Sắp xếp toàn bộ: theo tên bệnh nhân, sau đó theo thời gian
  return updated.sort((a, b) => {
    const nameA = (a["TÊN BỆNH NHÂN"] || "").toLowerCase();
    const nameB = (b["TÊN BỆNH NHÂN"] || "").toLowerCase();
    if (nameA < nameB) return -1;
    if (nameA > nameB) return 1;
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
