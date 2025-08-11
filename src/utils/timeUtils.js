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
      _originalIndex: idx, // lưu index ban đầu để sắp xếp lại
      _linkedIndex: null, // sẽ dùng để nhóm cặp
    });
    return acc;
  }, {});

  // Xử lý từng nhóm bác sĩ
  Object.keys(grouped).forEach((doctor) => {
    const group = grouped[doctor].sort(
      (a, b) => new Date(a[startCol]) - new Date(b[startCol])
    );

    for (let i = 0; i < group.length - 1; i++) {
      const currentEnd = new Date(group[i][endCol]);
      const nextStart = new Date(group[i + 1][startCol]);

      let changed = false;

      if (nextStart <= currentEnd) {
        // Dời ngày TH Y LỆNH của ca sau
        const adjustedStart = new Date(currentEnd.getTime() + 1 * 60 * 1000);
        group[i + 1][startCol] = formatDateVN(adjustedStart);
        changed = true;

        // Đảm bảo khoảng cách >= 5 phút
        const nextEnd = new Date(group[i + 1][endCol]);
        const diffMinutes = (nextEnd - adjustedStart) / (1000 * 60);
        if (diffMinutes < 5) {
          const adjustedEnd = new Date(adjustedStart.getTime() + 5 * 60 * 1000);
          group[i + 1][endCol] = formatDateVN(adjustedEnd);
          changed = true;
        }

        // Ghi thông tin trùng
        group[i + 1]["Trùng với bệnh nhân?"] = group[i]["TÊN BỆNH NHÂN"];
        group[i]["Trùng với bệnh nhân?"] = group[i + 1]["TÊN BỆNH NHÂN"];

        // Liên kết cặp
        group[i]._linkedIndex = group[i + 1]._originalIndex;
        group[i + 1]._linkedIndex = group[i]._originalIndex;
      }

      if (changed) {
        group[i + 1].Trạng_thái = `Đã chỉnh`;
      }
    }

    updated.push(...group);
  });

  // Sắp xếp để cặp trùng đứng liền nhau
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
  const d = new Date(date);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
};
