import React, { useState } from "react";
import "./App.scss";
import ExcelUploader from "./components/ExcelUploader/ExcelUploader";
import DataTable from "./components/DataTable/DataTable";
import {
  detectDateColumns,
  detectAndAdjustByDoctor,
  normalizeDate,
} from "./utils/timeUtils";
import { exportExcelFile } from "./utils/excelParser";

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
          newRow[col] = normalizeDate(newRow[col]); // chỉ gọi 1 hàm duy nhất
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
