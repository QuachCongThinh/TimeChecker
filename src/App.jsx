import React, { useState } from "react";
import "./App.scss";
import ExcelUploader from "./components/ExcelUploader/ExcelUploader";
import DataTable from "./components/DataTable/DataTable";
import { detectDateColumns,  detectAndAdjustByDoctor} from "./utils/timeUtils";
import { exportExcelFile } from "./utils/excelParser";
import { formatDateVN } from "./utils/timeUtils";

export default function App() {
  const [data, setData] = useState([]);

  const handleDataParsed = (parsed) => {
    if (!parsed.length) return;

    const headers = Object.keys(parsed[0]);
    const { startCol, endCol } = detectDateColumns(headers);

    if (!startCol || !endCol) {
      alert("Không tìm thấy cột 'Ngày thực hiện Y lệnh' hoặc 'Ngày kết quả'");
      return;
    }

    // Danh sách các cột ngày cần format
    const dateCols = [
      "NGÀY VÀO VIỆN",
      "NGÀY RA VIỆN",
      "NGÀY Y LỆNH",
      "NGÀY TH Y LỆNH",
      "NGÀY KẾT QUẢ",
    ];

    // Convert & format tất cả các cột ngày
    const data = parsed.map((row) => {
      const newRow = { ...row };
      dateCols.forEach((col) => {
        if (newRow[col]) {
          const dateVal = excelDateToJS(newRow[col]);
          newRow[col] = dateVal ? formatDateVN(dateVal) : "";
        }
      });
      return newRow;
    });

    const adjustedData = detectAndAdjustByDoctor(
      data,
      startCol,
      endCol,
      "NGƯỜI THỰC HIỆN"
    );

    setData(adjustedData);
  };

  const excelDateToJS = (value) => {
    if (!value) return "";
    if (typeof value === "number") {
      // Tách ngày & giờ
      const utcDays = Math.floor(value - 25569);
      const utcValue = utcDays * 86400;
      const dateInfo = new Date(utcValue * 1000);

      // Phần giờ trong ngày
      const fractionalDay = value - Math.floor(value) + 0.0000001;
      let totalSeconds = Math.floor(86400 * fractionalDay);
      const seconds = totalSeconds % 60;
      totalSeconds -= seconds;
      const hours = Math.floor(totalSeconds / (60 * 60));
      const minutes = Math.floor(totalSeconds / 60) % 60;

      dateInfo.setHours(hours);
      dateInfo.setMinutes(minutes);
      dateInfo.setSeconds(seconds);
      return dateInfo;
    }
    // Nếu là string
    return new Date(value);
  };

  return (
    <div className="app">
      <h1>TOOL KIỂM TRA VÀ SỬA GIỜ XML3</h1>
      <ExcelUploader onDataParsed={handleDataParsed} />
      {data.length > 0 && (
        <>
          <DataTable data={data} />
          <button className="export-btn" onClick={() => exportExcelFile(data)}>
            Xuất Excel
          </button>
        </>
      )}
    </div>
  );
}
