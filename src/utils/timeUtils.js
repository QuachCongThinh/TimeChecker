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

export const adjustNoOverlapByDoctor = (
  records,
  startCol,
  endCol,
  doctorCol
) => {
  const updated = [];

  // Gom ca theo bác sĩ
  const grouped = records.reduce((acc, rec) => {
    const doctor = rec[doctorCol] || "Không rõ";
    if (!acc[doctor]) acc[doctor] = [];
    acc[doctor].push({
      ...rec,
      Trạng_thái: "Không chỉnh",
      "Trùng với ca nào?": "",
    });
    return acc;
  }, {});

  Object.keys(grouped).forEach((doctor) => {
    let group = grouped[doctor].sort(
      (a, b) => new Date(a[startCol]) - new Date(b[startCol])
    );

    /**
     * 1️⃣ Xử lý tránh trùng giờ thực hiện
     */
    let hasOverlap = true;
    while (hasOverlap) {
      hasOverlap = false;
      for (let i = 0; i < group.length - 1; i++) {
        const currentEnd = new Date(group[i][endCol]);
        const nextStart = new Date(group[i + 1][startCol]);
        const nextEnd = new Date(group[i + 1][endCol]);

        const overlap =
          (nextStart >= new Date(group[i][startCol]) &&
            nextStart <= currentEnd) ||
          (nextEnd >= new Date(group[i][startCol]) && nextEnd <= currentEnd) ||
          (nextStart <= new Date(group[i][startCol]) && nextEnd >= currentEnd);

        if (overlap) {
          hasOverlap = true;
          const adjustedStart = new Date(currentEnd.getTime() + 60 * 1000);
          group[i + 1][startCol] = adjustedStart;

          let adjustedEnd = new Date(nextEnd);
          const diffMinutes = (adjustedEnd - adjustedStart) / (1000 * 60);
          if (diffMinutes < 5) {
            adjustedEnd = new Date(adjustedStart.getTime() + 5 * 60 * 1000);
          }
          group[i + 1][endCol] = adjustedEnd;

          group[
            i + 1
          ].Trạng_thái = `Đã chỉnh (tránh trùng giờ thực hiện với bác sĩ ${doctor})`;
          group[i + 1]["Trùng với ca nào?"] = group[i]["TÊN BỆNH NHÂN"];
        }
      }
      group.sort((a, b) => new Date(a[startCol]) - new Date(b[startCol]));
    }

    /**
     * 2️⃣ Kiểm tra tránh trùng Ngày kết quả
     */
    let hasResultOverlap = true;
    while (hasResultOverlap) {
      hasResultOverlap = false;
      for (let i = 0; i < group.length - 1; i++) {
        const resultA = new Date(group[i][endCol]);
        const resultB = new Date(group[i + 1][endCol]);

        if (resultA.getTime() === resultB.getTime()) {
          hasResultOverlap = true;
          const newStart = new Date(group[i + 1][startCol]);
          const newEnd = new Date(group[i + 1][endCol]);
          newStart.setMinutes(newStart.getMinutes() + 1);
          newEnd.setMinutes(newEnd.getMinutes() + 1);

          group[i + 1][startCol] = newStart;
          group[i + 1][endCol] = newEnd;

          group[
            i + 1
          ].Trạng_thái = `Đã chỉnh (tránh trùng Ngày kết quả với bác sĩ ${doctor})`;
          group[i + 1]["Trùng với ca nào?"] = group[i]["TÊN BỆNH NHÂN"];
        }
      }
      group.sort((a, b) => new Date(a[startCol]) - new Date(b[startCol]));
    }

    /**
     * 3️⃣ Format lại ngày cho tất cả ca
     */
    group = group.map((rec) => ({
      ...rec,
      [startCol]: formatDateVN(rec[startCol]),
      [endCol]: formatDateVN(rec[endCol]),
    }));

    updated.push(...group);
  });

  return updated;
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
