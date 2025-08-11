import React from "react";
import "./ExcelUploader.scss";
import { parseExcelFile } from "../../utils/excelParser";

export default function ExcelUploader({ onDataParsed }) {
  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const data = await parseExcelFile(file);
    onDataParsed(data);
  };

  return (
    <div className="excel-uploader">
      <label className="upload-btn">
        Chọn file Excel
        <input type="file" accept=".xlsx,.xls" onChange={handleFile} hidden />
      </label>
    </div>
  );
}
