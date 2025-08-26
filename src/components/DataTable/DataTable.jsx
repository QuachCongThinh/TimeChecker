import "./DataTable.scss";
import { useEffect, useState } from "react";

export default function DataTable({ data, onDataChange }) {
  const [animate, setAnimate] = useState(false);
  const [selectedRow, setSelectedRow] = useState(null);
  const [checkedRows, setCheckedRows] = useState({});
  const [doctorFilter, setDoctorFilter] = useState(""); // filter bác sĩ
  const [sortConfig, setSortConfig] = useState({ column: null, order: "asc" });

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
  let filteredData = doctorFilter
    ? data.filter((row) => row[doctorCol] === doctorFilter)
    : data;

  // sắp xếp dữ liệu
  if (sortConfig.column) {
    filteredData = [...filteredData].sort((a, b) => {
      const valA = a[sortConfig.column] ?? "";
      const valB = b[sortConfig.column] ?? "";
      if (valA < valB) return sortConfig.order === "asc" ? -1 : 1;
      if (valA > valB) return sortConfig.order === "asc" ? 1 : -1;
      return 0;
    });
  }

  const handleCheckboxChange = (row) => {
    setCheckedRows((prev) => {
      const updatedData = [...data];
      const globalIndex = row._originalIndex;

      if (updatedData[globalIndex].Trạng_thái === "Đã chỉnh (tự động)") {
        updatedData[globalIndex].Trạng_thái = "Không chỉnh";
      }

      if (onDataChange) onDataChange(updatedData);

      return { ...prev, [globalIndex]: true };
    });
  };

  const handleSort = (col) => {
    setSortConfig((prev) => {
      if (prev.column === col) {
        // nếu click lại cùng cột thì đảo chiều asc <-> desc
        return { column: col, order: prev.order === "asc" ? "desc" : "asc" };
      }
      // nếu chọn cột mới thì mặc định asc
      return { column: col, order: "asc" };
    });
  };

  return (
    <div className={`table-wrapper ${animate ? "slide-up" : ""}`}>
      <table className="data-table">
        <thead>
          <tr>
            <th></th> {/* checkbox */}
            <th>STT</th> {/* cột số thứ tự */}
            {columns.map((col) => (
              <th
                key={col}
                onClick={() => handleSort(col)}
                style={{ cursor: "pointer" }}
              >
                {col}
                {sortConfig.column === col &&
                  (sortConfig.order === "asc" ? " ▲" : " ▼")}
                {col === doctorCol && (
                  <div>
                    <select
                      value={doctorFilter}
                      onChange={(e) => setDoctorFilter(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
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
          {filteredData.map((row, index) => {
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
                    disabled={row.Trạng_thái === "✅ Hợp lệ"}
                    onChange={(e) => {
                      e.stopPropagation();
                      handleCheckboxChange(row);
                    }}
                  />
                </td>
                <td>{index + 1}</td> {/* cột STT */}
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
