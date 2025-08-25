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

  const handleCheckboxChange = (row) => {
    setCheckedRows((prev) => {
      const updatedData = [...data];
      const globalIndex = row._originalIndex;

      if (updatedData[globalIndex].Trạng_thái === "Đã chỉnh (tự động)") {
        updatedData[globalIndex].Trạng_thái = "Không chỉnh";
      }

      if (onDataChange) onDataChange(updatedData);

      // cập nhật checkedRows để render tick ngay lập tức
      return { ...prev, [globalIndex]: true };
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
          {filteredData.map((row) => {
            const isSelected = selectedRow === row._originalIndex;
            const isChecked = !!checkedRows[row._originalIndex];

            return (
              <tr
                key={row._originalIndex}
                className={`${isSelected ? "selected-row" : ""} ${
                  isChecked ? "checked-row" : ""
                }`}
                onClick={() => setSelectedRow(row._originalIndex)}
              >
                <td>
                  <input
                    type="checkbox"
                    checked={isChecked}
                    disabled={
                      row.Trạng_thái === "Hợp lệ (không trùng)" ||
                      row.Trạng_thái === "Không chỉnh"
                    }
                    onChange={(e) => {
                      e.stopPropagation();
                      handleCheckboxChange(row);
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
