import "./DataTable.scss";
import { useEffect, useState } from "react";

export default function DataTable({ data, onDataChange }) {
  const [animate, setAnimate] = useState(false);
  const [selectedRow, setSelectedRow] = useState(null);
  const [checkedRows, setCheckedRows] = useState({});
  const [doctorFilter, setDoctorFilter] = useState(""); // filter bác sĩ

  useEffect(() => {
    if (data.length) {
      setTimeout(() => setAnimate(true), 50);
    }
  }, [data]);

  if (!data.length) return null;

  const columns = Object.keys(data[0]).filter(
    (col) => col !== "_originalIndex" && col !== "_linkedIndex"
  );

  // danh sách bác sĩ duy nhất
  const doctorCol = "NGƯỜI THỰC HIỆN";
  const doctors = [
    ...new Set(data.map((row) => row[doctorCol]).filter(Boolean)),
  ];

  // dữ liệu sau khi filter
  const filteredData = doctorFilter
    ? data.filter((row) => row[doctorCol] === doctorFilter)
    : data;

  const handleRowClick = (idx) => {
    setSelectedRow(idx);
  };

  const handleCheckboxChange = (idx) => {
    setCheckedRows((prev) => {
      const newState = { ...prev, [idx]: !prev[idx] }; // toggle
      const updatedData = [...data];
      const globalIndex = data.indexOf(filteredData[idx]);

      if (newState[idx]) {
        // Khi tick: đổi trạng thái thành "Không chỉnh"
        updatedData[globalIndex].Trạng_thái = "Không chỉnh";
      } else {
        // Khi bỏ tick: khôi phục lại trạng thái ban đầu
        updatedData[globalIndex].Trạng_thái =
          "Đã chỉnh (tự động) – tránh trùng & giờ làm việc";
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
            <th></th>
            {columns.map((col) => (
              <th key={col}>
                {col}
                {col === doctorCol && (
                  <div>
                    <select
                      value={doctorFilter}
                      onChange={(e) => setDoctorFilter(e.target.value)}
                    >
                      <option value="">-- Tất cả --</option>
                      {doctors.map((doc) => (
                        <option key={doc} value={doc}>
                          {doc}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filteredData.map((row, idx) => {
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
                    disabled={
                      row.Trạng_thái !==
                      "Đã chỉnh (tự động) – tránh trùng & giờ làm việc"
                    }
                    onChange={(e) => {
                      e.stopPropagation();
                      handleCheckboxChange(idx);
                    }}
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
