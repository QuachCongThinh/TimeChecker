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
      _linkedIndex: null,
    });
    return acc;
  }, {});

  // Giờ nghỉ trưa
  const isInLunchBreak = (date) => {
    const h = date.getHours();
    return h === 12; // từ 12:00:00 đến 12:59:59
  };

  // Xử lý từng nhóm bác sĩ
  Object.keys(grouped).forEach((doctor) => {
    const group = grouped[doctor].sort(
      (a, b) => new Date(a[startCol]) - new Date(b[startCol])
    );

    for (let i = 0; i < group.length - 1; i++) {
      const currentEnd = new Date(group[i][endCol]);
      let nextStart = new Date(group[i + 1][startCol]);
      let nextEnd = new Date(group[i + 1][endCol]);

      let changed = false;

      // Nếu ca sau trùng hoặc bắt đầu trước ca trước kết thúc
      if (nextStart <= currentEnd) {
        nextStart = new Date(currentEnd.getTime() + 1 * 60 * 1000);
        changed = true;
      }

      // Đảm bảo tối thiểu 5 phút
      if ((nextEnd - nextStart) / (1000 * 60) < 5) {
        nextEnd = new Date(nextStart.getTime() + 5 * 60 * 1000);
        changed = true;
      }

      // Né giờ nghỉ trưa
      if (isInLunchBreak(nextStart) || isInLunchBreak(nextEnd)) {
        const afterLunch = new Date(nextStart);
        afterLunch.setHours(13, 1, 0, 0); // 13:01
        nextStart = afterLunch;
        nextEnd = new Date(afterLunch.getTime() + 5 * 60 * 1000);
        changed = true;
      }

      if (changed) {
        group[i + 1][startCol] = formatDateVN(nextStart);
        group[i + 1][endCol] = formatDateVN(nextEnd);

        group[i + 1]["Trùng với bệnh nhân?"] = group[i]["TÊN BỆNH NHÂN"];
        group[i]["Trùng với bệnh nhân?"] = group[i + 1]["TÊN BỆNH NHÂN"];

        group[i]._linkedIndex = group[i + 1]._originalIndex;
        group[i + 1]._linkedIndex = group[i]._originalIndex;
        group[i + 1].Trạng_thái = `Đã chỉnh`;
      }
    }

    updated.push(...group);
  });

  // Gom cặp trùng đứng liền nhau
  const visited = new Set();
  const finalOrder = [];

  updated.forEach((rec) => {
    if (visited.has(rec._originalIndex)) return;

    finalOrder.push(rec);
    visited.add(rec._originalIndex);

    if (rec._linkedIndex !== null) {
      const linkedRec = updated.find(
        (r) => r._originalIndex === rec._linkedIndex
      );
      if (linkedRec) {
        finalOrder.push(linkedRec);
        visited.add(linkedRec._originalIndex);
      }
    }
  });

  return finalOrder;
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
