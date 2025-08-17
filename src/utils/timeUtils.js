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
      (a, b) => new Date(a[startCol]) - new Date(b[startCol])
    );

    let latestEnd = null;

    for (let i = 0; i < group.length; i++) {
      let curStart = new Date(group[i][startCol]);
      let curEnd = new Date(group[i][endCol]);
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

      // Né giờ nghỉ trưa
      if (isInLunchBreak(curStart) || isInLunchBreak(curEnd)) {
        const afterLunch = new Date(curStart);
        afterLunch.setHours(13, 1, 0, 0); // 13:01
        curStart = afterLunch;
        curEnd = new Date(afterLunch.getTime() + 5 * 60 * 1000);
        changed = true;
      }

      // Cập nhật nếu có chỉnh
      if (changed) {
        group[i][startCol] = formatDateVN(curStart);
        group[i][endCol] = formatDateVN(curEnd);
        group[i].Trạng_thái = "Đã chỉnh";
      }

      // Ghi nhận latestEnd
      latestEnd = curEnd;
    }

    updated.push(...group);
  });

  // Sort toàn bộ theo thời gian
  return updated.sort((a, b) => new Date(a[startCol]) - new Date(b[startCol]));
};

export const formatDateVN = (date) => {
  if (!date || isNaN(new Date(date))) return "";
  const d = new Date(date);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
};
