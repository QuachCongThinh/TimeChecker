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
// const sameDay = (a, b) =>
//   a.getFullYear() === b.getFullYear() &&
//   a.getMonth() === b.getMonth() &&
//   a.getDate() === b.getDate();

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

// Cho trước start, duration → trả về {start,end} hợp lệ (né trưa, hạn chế >17:00), trong cửa sổ
const placeWithDuration = (start, durationMin, winStart, winEnd) => {
  let s = dClone(start);
  let e = new Date(s.getTime() + durationMin * MS);

  // Né nghỉ trưa
  if (s.getHours() === LUNCH_START_H || e.getHours() === LUNCH_START_H) {
    s = dayAfternoonStart(s);
    e = new Date(s.getTime() + durationMin * MS);
  }

  // Hạn chế > 17:00: nếu e > 17:00, thử dời sang khung sáng/chiều tiếp theo trong cửa sổ
  if (isAfterWork(e)) {
    // Ưu tiên chuyển sang 13:01 cùng ngày nếu còn kịp
    const aftStart = dayAfternoonStart(s);
    const aftEnd = dayAfternoonEnd(s);
    if (
      s < aftStart &&
      aftStart.getTime() + durationMin * MS <= aftEnd.getTime()
    ) {
      s = aftStart;
      e = new Date(s.getTime() + durationMin * MS);
    }
    // Nếu vẫn > 17:00 → chuyển sáng hôm sau
    if (isAfterWork(e)) {
      const nextMorning = dayMorningStart(
        new Date(s.getFullYear(), s.getMonth(), s.getDate() + 1)
      );
      if (nextMorning <= winEnd) {
        s = nextMorning;
        e = new Date(s.getTime() + durationMin * MS);
      }
    }
    // Nếu vẫn vượt cửa sổ, chấp nhận giữ (chỉ khi e <= winEnd), còn nếu vượt winEnd thì trả null
  }

  // Kiểm tra phạm vi cửa sổ
  if (s < winStart) {
    s = dClone(winStart);
    e = new Date(s.getTime() + durationMin * MS);
  }

  if (e > winEnd) {
    // Không thể đặt trong cửa sổ
    return null;
  }
  return { start: s, end: e };
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
      Trạng_thái: rec.Trạng_thái || "Không chỉnh",
      _originalIndex: idx,
    });
    return acc;
  }, {});

  Object.keys(grouped).forEach((doctor) => {
    const group = grouped[doctor].sort(
      (a, b) => parseDate(a[startCol]) - parseDate(b[startCol])
    );

    let latestEnd = null; // ràng buộc theo timeline bác sĩ

    for (let i = 0; i < group.length; i++) {
      const row = group[i];

      // Ca chỉnh tay → giữ nguyên (nhưng vẫn validate phạm vi, nếu lệch thì cố đặt lại gần nhất)
      const manualLocked = row.Trạng_thái === "Đã chỉnh (thủ công)";

      let originalStart = parseDate(row[startCol]);
      let originalEnd = parseDate(row[endCol]);

      // Duration tối thiểu 5’
      let durationMin = Math.max(
        5,
        Math.round((originalEnd - originalStart) / MS)
      );

      const { admit, discharge, winStart, winEnd } = getPatientWindow(row);
      const preference = inferHalfDayPreference(admit, discharge);

      let targetStart = originalStart;

      // Nếu trùng với ca trước của bác sĩ, dời sang ngay sau
      if (latestEnd && targetStart <= latestEnd) {
        targetStart = new Date(latestEnd.getTime() + 1 * MS);
      }

      // Áp cửa sổ bệnh nhân + ưu tiên buổi
      let feasibleStart = nextFeasibleStart(
        targetStart,
        preference,
        winStart,
        winEnd
      );
      if (!feasibleStart) {
        // Không còn slot trong cửa sổ → thử “giữ nguyên” nếu giờ gốc đã nằm trong cửa sổ
        const inWin = originalStart >= winStart && originalEnd <= winEnd;
        if (inWin && (!latestEnd || originalStart > latestEnd)) {
          feasibleStart = originalStart; // chấp nhận giờ gốc
        } else {
          // Bất khả thi
          row.Trạng_thái = manualLocked
            ? "Đã chỉnh (thủ công) – ngoài cửa sổ"
            : "Không thể xếp trong cửa sổ";
          updated.push(row);
          latestEnd = originalEnd;
          continue;
        }
      }

      // Đặt theo duration và ràng buộc 17:00, trưa
      const placed = placeWithDuration(
        feasibleStart,
        durationMin,
        winStart,
        winEnd
      );

      if (!placed) {
        // Không thể đặt khớp duration trong cửa sổ
        row.Trạng_thái = manualLocked
          ? "Đã chỉnh (thủ công) – ngoài cửa sổ"
          : "Không thể xếp trong cửa sổ";
        updated.push(row);
        latestEnd = originalEnd;
        continue;
      }

      const { start: finalStart, end: finalEnd } = placed;

      // Nếu manualLocked và giờ gốc đã hợp lệ & không trùng → giữ nguyên
      if (manualLocked) {
        const manualOk =
          originalStart >= winStart &&
          originalEnd <= winEnd &&
          (!latestEnd || originalStart > latestEnd) &&
          !isDuringLunch(originalStart) &&
          !isDuringLunch(originalEnd) &&
          !isAfterWork(originalEnd);

        if (manualOk) {
          // giữ nguyên manual
          latestEnd = originalEnd;
          updated.push(row);
          continue;
        }
      }

      // Gán kết quả
      row[startCol] = normalizeDate(finalStart);
      row[endCol] = normalizeDate(finalEnd);

      // Gắn trạng thái
      if (manualLocked) {
        // người dùng có chỉnh tay nhưng ta buộc phải dời để hợp lệ
        row.Trạng_thái = "Đã chỉnh (thủ công) + hiệu chỉnh hợp lệ";
      } else {
        // Nếu thay đổi so với gốc thì đánh dấu tự động
        const changed =
          originalStart.getTime() !== finalStart.getTime() ||
          originalEnd.getTime() !== finalEnd.getTime();
        row.Trạng_thái = changed
          ? "Đã chỉnh (tự động)"
          : row.Trạng_thái || "Không chỉnh";
      }

      latestEnd = finalEnd;
      updated.push(row);
    }

    // Validate một lượt cuối cho nhóm bác sĩ (né trùng còn sót)
    for (let i = 1; i < group.length; i++) {
      const prev = group[i - 1];
      const cur = group[i];
      let prevEnd = parseDate(prev[endCol]);
      let curStart = parseDate(cur[startCol]);
      let curEnd = parseDate(cur[endCol]);

      if (curStart <= prevEnd) {
        const durationMin = Math.max(5, Math.round((curEnd - curStart) / MS));
        const { winStart, winEnd, admit, discharge } = getPatientWindow(cur);
        const preference = inferHalfDayPreference(admit, discharge);

        let s = new Date(prevEnd.getTime() + 1 * MS);
        s = nextFeasibleStart(s, preference, winStart, winEnd) || s;
        const placed = placeWithDuration(s, durationMin, winStart, winEnd);

        if (placed) {
          cur[startCol] = normalizeDate(placed.start);
          cur[endCol] = normalizeDate(placed.end);
          cur.Trạng_thái =
            cur.Trạng_thái === "Đã chỉnh (thủ công)"
              ? "Đã chỉnh (thủ công) + hiệu chỉnh hợp lệ"
              : "Đã chỉnh (tự động)";
          // cập nhật lại prevEnd cho vòng tiếp
          prevEnd = placed.end;
        } else {
          // nếu vẫn không thể, giữ nguyên nhưng đánh dấu
          cur.Trạng_thái =
            cur.Trạng_thái === "Đã chỉnh (thủ công)"
              ? "Đã chỉnh (thủ công) – ngoài cửa sổ"
              : "Không thể xếp trong cửa sổ";
        }
      }
    }
  });

  // Sắp theo tên BN rồi theo thời gian
  return updated.sort((a, b) => {
    const nameA = (a["TÊN BỆNH NHÂN"] || "").toLowerCase();
    const nameB = (b["TÊN BỆNH NHÂN"] || "").toLowerCase();
    if (nameA < nameB) return -1;
    if (nameA > nameB) return 1;
    return parseDate(a[startCol]) - parseDate(b[startCol]);
  });
};

// export const detectAndAdjustByDoctor = (
//   records,
//   startCol,
//   endCol,
//   doctorCol
// ) => {
//   const updated = [];

//   // Nhóm theo bác sĩ
//   const grouped = records.reduce((acc, rec, idx) => {
//     const doctor = rec[doctorCol] || "Không rõ";
//     if (!acc[doctor]) acc[doctor] = [];
//     acc[doctor].push({
//       ...rec,
//       Trạng_thái: rec.Trạng_thái || "Không chỉnh",
//       "Trùng với bệnh nhân?": rec["Trùng với bệnh nhân?"] || "",
//       _originalIndex: idx,
//     });
//     return acc;
//   }, {});

//   const isInLunchBreak = (date) =>
//     date.getHours() === 12 || (date.getHours() === 13 && date.getMinutes() < 1);

//   Object.keys(grouped).forEach((doctor) => {
//     const group = grouped[doctor].sort(
//       (a, b) => parseDate(a[startCol]) - parseDate(b[startCol])
//     );

//     let latestEnd = null;

//     for (let i = 0; i < group.length; i++) {
//       let curStart = parseDate(group[i][startCol]);
//       let curEnd = parseDate(group[i][endCol]);
//       let changed = false;

//       // Nếu đã chỉnh thủ công thì giữ nguyên
//       if (group[i].Trạng_thái === "Đã chỉnh (thủ công)") {
//         latestEnd = curEnd;
//         updated.push(group[i]);
//         continue;
//       }

//       // Tính duration gốc (>= 5 phút)
//       let duration = (curEnd - curStart) / (1000 * 60);
//       if (isNaN(duration) || duration < 5) duration = 5;

//       // Nếu bắt đầu < latestEnd thì dời sang sát ngay latestEnd
//       if (latestEnd && curStart <= latestEnd) {
//         curStart = new Date(latestEnd.getTime() + 1 * 60 * 1000);
//         changed = true;
//       }

//       // Tính lại giờ kết thúc
//       curEnd = new Date(curStart.getTime() + duration * 60 * 1000);

//       // Né giờ nghỉ trưa
//       if (isInLunchBreak(curStart) || isInLunchBreak(curEnd)) {
//         const afterLunch = new Date(curStart);
//         afterLunch.setHours(13, 1, 0, 0); // 13:01
//         curStart = afterLunch;
//         curEnd = new Date(curStart.getTime() + duration * 60 * 1000);
//         changed = true;
//       }

//       // Ghi kết quả
//       group[i][startCol] = normalizeDate(curStart);
//       group[i][endCol] = normalizeDate(curEnd);
//       group[i].Trạng_thái = changed
//         ? "Đã chỉnh (tự động)"
//         : group[i].Trạng_thái || "Không chỉnh";

//       latestEnd = curEnd;
//       updated.push(group[i]);
//     }

//     // ✅ VALIDATE lần cuối: quét lại toàn bộ ca của bác sĩ
//     for (let i = 1; i < group.length; i++) {
//       let prevEnd = parseDate(group[i - 1][endCol]);
//       let curStart = parseDate(group[i][startCol]);
//       let curEnd = parseDate(group[i][endCol]);

//       let duration = (curEnd - curStart) / (1000 * 60);
//       if (isNaN(duration) || duration < 5) duration = 5;

//       if (curStart <= prevEnd) {
//         // Dời ca trùng sang sau ca trước
//         curStart = new Date(prevEnd.getTime() + 1 * 60 * 1000);
//         curEnd = new Date(curStart.getTime() + duration * 60 * 1000);

//         // Né giờ nghỉ trưa
//         if (isInLunchBreak(curStart) || isInLunchBreak(curEnd)) {
//           const afterLunch = new Date(curStart);
//           afterLunch.setHours(13, 1, 0, 0);
//           curStart = afterLunch;
//           curEnd = new Date(curStart.getTime() + duration * 60 * 1000);
//         }

//         group[i][startCol] = normalizeDate(curStart);
//         group[i][endCol] = normalizeDate(curEnd);
//         group[i].Trạng_thái = "Đã chỉnh (tự động)";
//       }
//     }
//   });

//   // Sắp xếp toàn bộ: theo tên bệnh nhân, sau đó theo thời gian
//   return updated.sort((a, b) => {
//     const nameA = (a["TÊN BỆNH NHÂN"] || "").toLowerCase();
//     const nameB = (b["TÊN BỆNH NHÂN"] || "").toLowerCase();
//     if (nameA < nameB) return -1;
//     if (nameA > nameB) return 1;
//     return parseDate(a[startCol]) - parseDate(b[startCol]);
//   });
// };

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
