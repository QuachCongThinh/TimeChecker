import React from "react";
import "./DataTable.scss";

export default function DataTable({ data }) {
  if (!data.length) return null;

  // Lấy danh sách cột, bỏ cột private
  const columns = Object.keys(data[0]).filter(
    (col) => col !== "_originalIndex" && col !== "_linkedIndex"
  );

  return (
    <div className="table-wrapper">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col}>{col}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, idx) => {
            let rowClass = "";
            let cellStyle = {};

            if (row.Trạng_thái.includes("Đã chỉnh")) {
              rowClass = "adjusted-row"; // vàng nhạt cho ca đã chỉnh
            } else if (row["Trùng với ca nào?"]) {
              // Chỉ đổi màu đỏ nếu có ca trùng
              cellStyle = { color: "red", fontWeight: "bold" };
            }

            return (
              <tr key={idx} className={rowClass}>
                {columns.map((col, colIdx) => (
                  <td
                    key={colIdx}
                    style={col === "TÊN BỆNH NHÂN" ? cellStyle : {}}
                  >
                    {row[col]}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
