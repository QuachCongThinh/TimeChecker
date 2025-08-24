import React, { useRef, useState } from "react";
import "./ExcelUploader.scss";
import { parseExcelFile } from "../../utils/excelParser";

export default function ExcelUploader({ onDataParsed = () => {} }) {
  const inputRef = useRef(null);
  const [fileName, setFileName] = useState("");
  const [loading, setLoading] = useState(false);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setLoading(true);
      const data = await parseExcelFile(file);
      onDataParsed(data);        // dữ liệu thật
      setFileName(file.name);
    } catch (err) {
      console.error(err);
      // nếu muốn, bạn có thể hiển thị toast ở đây
      onDataParsed([]);          // fallback an toàn
      setFileName("");
    } finally {
      setLoading(false);
      // reset để lần sau có thể chọn lại cùng file
      e.target.value = "";
    }
  };

  const handleRemoveFile = () => {
    setFileName("");
    if (inputRef.current) inputRef.current.value = "";
    onDataParsed([]);            // ✅ gửi mảng rỗng thay vì null
  };

  return (
    <div className="excel-uploader">
      <label className={`upload-btn ${loading ? "is-loading" : ""}`}>
        {loading ? "Đang xử lý..." : "Chọn file Excel"}
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={handleFile}
          hidden
          disabled={loading}
        />
      </label>

      {fileName && (
        <div className="file-info">
          <span className="file-name" title={fileName}>{fileName}</span>
          <button
            type="button"
            className="remove-btn"
            onClick={handleRemoveFile}
            disabled={loading}
            aria-label="Xóa file đã chọn"
            title="Xóa file đã chọn"
          >
            Xóa file
          </button>
        </div>
      )}
    </div>
  );
}
