import "./DataTable.scss";
import { useEffect, useState } from "react";

export default function DataTable({ data, onDataChange }) {
  const [animate, setAnimate] = useState(false);
  const [selectedRow, setSelectedRow] = useState(null);
  const [checkedRows, setCheckedRows] = useState({}); // lưu trạng thái checkbox

  useEffect(() => {
    if (data.length) {
      setTimeout(() => setAnimate(true), 50);
    }
  }, [data]);

  if (!data.length) return null;

  const columns = Object.keys(data[0]).filter(
    (col) => col !== "_originalIndex" && col !== "_linkedIndex"
  );

  const handleRowClick = (idx) => {
    setSelectedRow(idx);
  };

  const handleCheckboxChange = (idx) => {
    setCheckedRows((prev) => {
      const isChecked = !prev[idx]; // toggle trạng thái
      const newState = { ...prev, [idx]: isChecked };

      const updatedData = [...data];
      if (isChecked) {
        // tick → đổi trạng thái
        updatedData[idx].Trạng_thái = "Không chỉnh";
      } else {
        // uncheck → có thể reset trạng thái về ban đầu
        updatedData[idx].Trạng_thái = "Đã chỉnh (tự động) – tránh trùng";
      }

      if (onDataChange) onDataChange(updatedData);
      return newState;
    });
  };

  return (
    <div className={`table-wrapper ${animate ? "slide-up" : ""}`}>
      <table className="data-table">
        <thead>
          <tr>
            <th></th> {/* cột checkbox */}
            {columns.map((col) => (
              <th key={col}>{col}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, idx) => {
            const isSelected = selectedRow === idx;
            const isChecked = checkedRows[idx];

            return (
              <tr
                key={idx}
                className={`${isSelected ? "selected-row" : ""} ${
                  isChecked ? "checked-row" : ""
                }`}
                onClick={() => handleRowClick(idx)}
              >
                <td>
                  <input
                    type="checkbox"
                    checked={!!checkedRows[idx]}
                    onChange={() => handleCheckboxChange(idx)}
                    onClick={(e) => e.stopPropagation()}
                  />
                </td>
                {columns.map((col, colIdx) => (
                  <td key={colIdx}>{row[col]}</td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
