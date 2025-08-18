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
    // chỉ đổi trạng thái nếu trạng thái hiện tại là "Đã chỉnh (tự động) – tránh trùng"
    if (data[idx].Trạng_thái === "Đã chỉnh (tự động) – tránh trùng") {
      setCheckedRows((prev) => {
        const newState = { ...prev, [idx]: true }; // tick checkbox
        const updatedData = [...data];
        updatedData[idx].Trạng_thái = "Không chỉnh";

        if (onDataChange) onDataChange(updatedData);
        return newState;
      });
    }
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
                    checked={!!isChecked}
                    onChange={() => handleCheckboxChange(idx)}
                    disabled={row.Trạng_thái === "Không chỉnh"} // disable nếu đã là "Không chỉnh"
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
