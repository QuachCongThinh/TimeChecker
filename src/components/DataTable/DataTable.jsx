import "./DataTable.scss";
import { useEffect, useState } from "react";

export default function DataTable({ data }) {
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    if (data.length) {
      setTimeout(() => setAnimate(true), 50);
    }
  }, [data]);

  if (!data.length) return null;

  const columns = Object.keys(data[0]).filter(
    (col) => col !== "_originalIndex" && col !== "_linkedIndex"
  );

  return (
    <div className={`table-wrapper ${animate ? "slide-up" : ""}`}>
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

            if (row.Trạng_thái?.includes("Đã chỉnh")) {
              rowClass = "adjusted-row";
            } else if (row["Trùng với ca nào?"]) {
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
