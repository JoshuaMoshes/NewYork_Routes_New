"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import ReactApexChart from "react-apexcharts";
import { ApexOptions } from "apexcharts";
import * as XLSX from "xlsx";

// Firebase
import { db } from "@/app/firebase"; // <-- import your Firebase config
import { collection, getDocs } from "firebase/firestore";

// Icons
import { FiRefreshCw } from "react-icons/fi"; 

// ---------------------------------------------------
// 1) Define which routes are "Affected" vs "Not Affected"
// ---------------------------------------------------
const affectedRoutes = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
const notAffectedRoutes = [16, 18];

// ---------------------------------------------------
// 2) We'll collect daily data from Excel & Firebase
// ---------------------------------------------------
// Define cutoff dates with correct years
const excelCutoff = new Date(Date.UTC(2025, 0, 0, 0, 0));    // Dec 29, 2024 @ 5:00 UTC
const firebaseCutoff = new Date(Date.UTC(2025, 0, 0, 0, 15)); // Dec 29, 2024 @ 5:15 UTC

// Helper function to convert date to "YYYY-MM-DD"
function toYMD(dt: Date) {
  const yyyy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// Helper function to determine the correct year based on month
function getYearForMonth(month: number): number {
  // December (11) is 2024, January (0) is 2025
  if (month === 11) return 2024;
  if (month === 0) return 2025;
  // Extend this logic if more months are involved
  // For now, default to 2024
  return 2024;
}

const ChartTwo: React.FC = () => {
  // ---------------------------------------------------
  // A) State
  // ---------------------------------------------------
  // Removed visibility states for each series since ApexCharts' built-in legend will handle it

  // We'll keep two arrays of daily [timestamp, average] for each category
  const [seriesAffected, setSeriesAffected] = useState<[number, number][]>([]);
  const [seriesNotAffected, setSeriesNotAffected] = useState<[number, number][]>([]);
  
  // Loading indicator
  const [isLoading, setIsLoading] = useState(false);

  // Array of abbreviated month names for consistent UTC formatting
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  // ---------------------------------------------------
  // B) Fetch + Combine data
  // ---------------------------------------------------
  const fetchData = useCallback(async () => {
    setIsLoading(true);
      // Aggregators for daily sums + counts
      type DailyAgg = Record<string, { sum: number; count: number }>;
      const aggregatorAffected: DailyAgg = {};
      const aggregatorNotAffected: DailyAgg = {};

      // We keep track of all unique dates to ensure we graph each date
      const allDatesSet = new Set<string>();

      // Helper to ensure aggregator has date key
      function ensureAgg(obj: DailyAgg, dateStr: string) {
        if (!obj[dateStr]) {
          obj[dateStr] = { sum: 0, count: 0 };
        }
      }
    try {


      // ---------------------------------------------------
      // 1) Read from Excel
      // ---------------------------------------------------
      {
        const response = await fetch("/routes.xlsx");
        if (!response.ok) {
          console.error("Failed to fetch Excel file:", response.statusText);
        } else {
          // Parse the Excel file
          const arrayBuffer = await response.arrayBuffer();
          const workbook = XLSX.read(arrayBuffer, { type: "array" });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const rawRows: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

          if (rawRows.length <= 1) {
            console.warn("Excel file has no data rows");
          } else {
            // dataRows will contain routeNum, dateStr, ???, timeBlock, totalMins, ...
            const dataRows = rawRows.slice(1);

            dataRows.forEach((row) => {
              const routeNum = Number(row[0]); 
              const dateStr = row[1];         // e.g. "12-08"
              const timeBlock = row[3];       // e.g. "18:15"
              const totalMins = Number(row[4]) || 0;

              // Only handle routes we care about
              const inAffected = affectedRoutes.includes(routeNum);
              const inNotAffected = notAffectedRoutes.includes(routeNum);
              if (!inAffected && !inNotAffected) return;

              // Parse date/time => Date
              if (!dateStr || !timeBlock) return;
              const [mmStr, ddStr] = String(dateStr).split("-");
              if (!mmStr || !ddStr) return;

              const mm = parseInt(mmStr, 10) - 1; // 0-based
              const dd = parseInt(ddStr, 10);

              const [hhStr, minStr] = String(timeBlock).split(":");
              if (!hhStr || !minStr) return;
              const hh = parseInt(hhStr, 10);
              const mn = parseInt(minStr, 10);

              const year = getYearForMonth(mm);
              const fullDate = new Date(Date.UTC(year, mm, dd, hh, mn));
              if (fullDate.getTime() >= excelCutoff.getTime()) return;

              // We'll aggregate by day
              const dayStr = toYMD(fullDate);
              allDatesSet.add(dayStr);

              if (inAffected) {
                ensureAgg(aggregatorAffected, dayStr);
                aggregatorAffected[dayStr].sum += totalMins;
                aggregatorAffected[dayStr].count++;
              }
              if (inNotAffected) {
                ensureAgg(aggregatorNotAffected, dayStr);
                aggregatorNotAffected[dayStr].sum += totalMins;
                aggregatorNotAffected[dayStr].count++;
              }
            });
          }
        }
      }

      // ---------------------------------------------------
      // 2) Read from Firebase
      // doc.id => "MM_DD_HH-mm"
      // ---------------------------------------------------
      const allRoutesWeCareAbout = [...affectedRoutes, ...notAffectedRoutes];
      const uniqueRoutesWeCare = Array.from(new Set(allRoutesWeCareAbout));

      for (let routeNum of uniqueRoutesWeCare) {
        const colRef = collection(db, String(routeNum));
        const snapshot = await getDocs(colRef);

        snapshot.forEach((doc) => {
          const data = doc.data();
          const totalMins = data.total_minutes ?? 0;
          const docId = doc.id; // e.g. "12_29_05-15"

          const [mmStr, ddStr, hhMin] = docId.split("_");
          if (!mmStr || !ddStr || !hhMin) return;
          const [hhStr, minStr] = hhMin.split("-");
          if (!hhStr || !minStr) return;

          const mm = parseInt(mmStr, 10) - 1; // 0-based
          const dd = parseInt(ddStr, 10);
          const hh = parseInt(hhStr, 10);
          const mn = parseInt(minStr, 10);

          const year = getYearForMonth(mm);
          const fullDate = new Date(Date.UTC(year, mm, dd, hh, mn));
          if (fullDate.getTime() < firebaseCutoff.getTime()) return;

          // Aggregate daily
          const dayStr = toYMD(fullDate);
          allDatesSet.add(dayStr);

          // This route belongs to either affected or not-affected
          const inAffected = affectedRoutes.includes(routeNum);
          const inNotAffected = notAffectedRoutes.includes(routeNum);

          if (inAffected) {
            ensureAgg(aggregatorAffected, dayStr);
            aggregatorAffected[dayStr].sum += totalMins;
            aggregatorAffected[dayStr].count++;
          }
          if (inNotAffected) {
            ensureAgg(aggregatorNotAffected, dayStr);
            aggregatorNotAffected[dayStr].sum += totalMins;
            aggregatorNotAffected[dayStr].count++;
          }
        });
      }

      // ---------------------------------------------------
      // 3) Build arrays [timestamp, average]
      // to ensure we show every date we have data for
      // ---------------------------------------------------
      const allDatesArray = Array.from(allDatesSet).sort(); 
      const tempAffected: [number, number][] = [];
      const tempNotAffected: [number, number][] = [];

      for (const dateStr of allDatesArray) {
        const [y, m, d] = dateStr.split("-");
        const yearNum = parseInt(y, 10);
        const monNum = parseInt(m, 10) - 1; // 0-based
        const dayNum = parseInt(d, 10);
        // Use UTC timestamp
        const ts = Date.UTC(yearNum, monNum, dayNum);

        // Affected
        if (aggregatorAffected[dateStr]) {
          const { sum, count } = aggregatorAffected[dateStr];
          const avg = count > 0 ? sum / count : 0;
          tempAffected.push([ts, avg]);
        } else {
          // If no data for that date, push 0
          tempAffected.push([ts, 0]);
        }

        // NotAffected
        if (aggregatorNotAffected[dateStr]) {
          const { sum, count } = aggregatorNotAffected[dateStr];
          const avg = count > 0 ? sum / count : 0;
          tempNotAffected.push([ts, avg]);
        } else {
          tempNotAffected.push([ts, 0]);
        }
      }

      setSeriesAffected(tempAffected);
      setSeriesNotAffected(tempNotAffected);

    } catch (err) {
      console.error("Error fetching data:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ---------------------------------------------------
  // C) useEffect: fetch data on mount
  // ---------------------------------------------------
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ---------------------------------------------------
  // D) Handle Reload
  // ---------------------------------------------------
  const handleReload = () => {
    setSeriesAffected([]);
    setSeriesNotAffected([]);
    fetchData();
  };

  // ---------------------------------------------------
  // E) Chart Title
  // ---------------------------------------------------
  const chartTitle = "Commute Times on Congestion Zone Routes in New York City Versus Boston and Chicago";

  // ---------------------------------------------------
  // F) Build final series to include both datasets
  // ---------------------------------------------------
  const finalSeries = [
    {
      name: "Routes in New York City Congestion Zone",
      data: seriesAffected,
    },
    {
      name: "Routes in Boston and Chicago",
      data: seriesNotAffected,
    },
  ];

  // ---------------------------------------------------
  // G) ApexChart styling to match chartOne
  // ---------------------------------------------------
  // Define the timestamp for January 5, 2025
  const jan5Timestamp = Date.UTC(2025, 0, 5); // Months are 0-indexed

  // Check if data includes January 5, 2025 and at least one series is visible
  const hasJan5 =
    seriesAffected.some(([ts, _]) => ts === jan5Timestamp) ||
    seriesNotAffected.some(([ts, _]) => ts === jan5Timestamp);

  // Memoize the options to optimize performance
  const options: ApexOptions = useMemo(() => ({
    chart: {
      type: "area",
      height: 310,
      fontFamily: "Satoshi, sans-serif",
      toolbar: { show: false },
      zoom: { enabled: true },
      animations: {
        enabled: true,
        easing: 'easeinout',
        speed: 800,
        animateGradually: {
          enabled: true,
          delay: 150
        },
        dynamicAnimation: {
          enabled: true,
          speed: 350
        }
      },
    },
    noData: {
      text: isLoading ? "Loading..." : "No data available",
      align: "center",
      verticalAlign: "middle",
      style: {
        color: "black",
        fontSize: "24px",
        fontFamily: "Satoshi, sans-serif",
      }
    },
    legend: { 
      show: true, // Enable built-in legend
      position: 'bottom', // Position legend below the chart
      horizontalAlign: 'center', // Center align the legend
      // labels: {
      //   colors: ['#000'], // Adjust label colors as needed
      //   fontSize: '12px', // Set legend text size to match ChartOne
      // },
      markers: {
        width: 13,
        height: 13,
      },
    },
    // Set distinct colors for each series
    colors: ["#5750F1", "#FA7247"],
    fill: {
      type: "gradient",
      gradient: {
        shadeIntensity: 1,
        opacityFrom: 0.55,
        opacityTo: 0,
        stops: [0, 90, 100],
      },
    },
    stroke: {
      curve: "smooth",
    },
    // Markers hidden by default, show on hover
    markers: {
      size: 0,
      hover: {
        size: 5,
      },
    },
    dataLabels: {
      enabled: false,
    },
    grid: {
      strokeDashArray: 5,
      xaxis: { lines: { show: false } },
      yaxis: { lines: { show: true } },
    },
    tooltip: {
      x: {
        format: "MMM dd", // e.g. Dec 10
        formatter: function (val) {
          const date = new Date(val as number);
          let day = String(date.getUTCDate()).padStart(2, '0'); // Ensures two-digit day
          const month = monthNames[date.getUTCMonth()]; // UTC Month
          if (day[0] === "0"){
            day = day[1]
          }
          return `${day} ${month}`; // e.g., "1 Jan"
        },
      },
      y: {
        formatter: (val) => (typeof val === 'number' ? `${val.toFixed(0)} min` : ''),
      },
    },
    xaxis: {
      type: "datetime",
      title: {
        text: "Date",
      },
      labels: {
        style: {
          fontSize: "12px",
        },
        formatter: function (value, timestamp, opts) {
          const date = new Date(timestamp as number);
          let day = String(date.getUTCDate()).padStart(2, '0'); // Ensures two-digit day
          const month = monthNames[date.getUTCMonth()]; // UTC Month
          if (day[0] === "0"){
            day = day[1]
          }
          return `${day} ${month}`; // e.g., "1 Jan"
        },
      },
      // Removed tickAmount to let ApexCharts handle it automatically
    },
    yaxis: {
      title: {
        text: "Average commute time (min)",
      },
      labels: {
        formatter: (val) => (typeof val === 'number' ? `${val.toFixed(0)} min` : ''),
        style: {
          fontSize: "12px",
        },
      },
      min: 0,
    },
    // Conditional Vertical line annotation (e.g., start of Congestion Pricing)
    annotations: {
      xaxis: hasJan5 ? [
        {
          x: jan5Timestamp, // January 5, 2025 (month 0)
          strokeDashArray: 4,
          borderColor: "black",
          label: {
            style: {
              fontWeight: 'bold',
              color: "#777", // Corrected color format
              background: "white",
              padding: {
                left: 5,
                right: 5,
                top: 5,
                bottom: 5,
              }
            },
            text: "Congestion Pricing Start",
            orientation: "horizontal",
          },
        },
      ] : [],
    },
    responsive: [
      {
        breakpoint: 1024,
        options: {
          chart: { height: 300 },
        },
      },
      {
        breakpoint: 1366,
        options: {
          chart: { height: 320 },
        },
      },
    ],
  }), [isLoading, hasJan5, jan5Timestamp, seriesAffected, seriesNotAffected]);

  // ---------------------------------------------------
  // H) Render
  // ---------------------------------------------------
  return (
    <div className="col-span-12 rounded-[10px] bg-white px-4 pb-6 pt-7.5 shadow-1 dark:bg-gray-dark dark:shadow-card">
      {/* Header & Controls (similar to chartOne's style) */}
      <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <h4 className="text-body-2xlg font-bold text-dark dark:text-white mb-2 sm:mb-0">
          {chartTitle}
        </h4>

        {/* Removed Custom Legend Controls */}

        {/* Refresh Button */}
        <button
          onClick={handleReload}
          className="flex items-center justify-center p-2 bg-gray-200 rounded hover:bg-gray-300 transition"
          aria-label="Refresh Data"
        >
          <FiRefreshCw size={20} />
        </button>
      </div>

      {/* Chart */}
      <div className="w-full overflow-x-auto">
        <ReactApexChart
          options={options}
          series={finalSeries}
          type="area"
          height={310}
        />
      </div>
    </div>
  );
};

export default ChartTwo;
