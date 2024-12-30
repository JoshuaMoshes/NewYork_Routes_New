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
const affectedRoutes = [1, 2, 3, 4, 5];
const notAffectedRoutes = [16, 18];

// ---------------------------------------------------
// 2) We'll collect daily data from Excel & Firebase
// ---------------------------------------------------
// Define cutoff dates with correct years
const excelCutoff = new Date(Date.UTC(2024, 11, 29, 5, 0));    // Dec 29, 2024 @ 5:00 UTC
const firebaseCutoff = new Date(Date.UTC(2024, 11, 29, 5, 15)); // Dec 29, 2024 @ 5:15 UTC

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

// ---------------------------------------------------
// 3) Linear Regression Helper
// ---------------------------------------------------
function computeLineOfBestFit(data: [number, number][]) {
  // If fewer than 2 points, we can't compute a slope
  if (data.length < 2) return [];

  // 1) Compute sums
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  const n = data.length;

  data.forEach(([x, y]) => {
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
  });

  // 2) Slope (m) and Intercept (b)
  const denom = n * sumXX - sumX * sumX;
  // If denom is 0, skip
  if (denom === 0) return [];

  const m = (n * sumXY - sumX * sumY) / denom;
  const b = (sumY - m * sumX) / n;

  // 3) We only need two points for a straight line
  const xVals = data.map(([x]) => x);
  const xMin = Math.min(...xVals);
  const xMax = Math.max(...xVals);

  const yMin = m * xMin + b;
  const yMax = m * xMax + b;

  return [
    [xMin, yMin],
    [xMax, yMax]
  ];
}

const ChartTwo: React.FC = () => {
  // ---------------------------------------------------
  // A) State
  // ---------------------------------------------------
  const [isAffectedVisible, setIsAffectedVisible] = useState(true);
  const [isNotAffectedVisible, setIsNotAffectedVisible] = useState(true);

  // We'll keep two arrays of daily [timestamp, average] for each category
  const [seriesAffected, setSeriesAffected] = useState<[number, number][]>([]);
  const [seriesNotAffected, setSeriesNotAffected] = useState<[number, number][]>([]);

  // Loading indicator
  const [isLoading, setIsLoading] = useState(false);

  // ---------------------------------------------------
  // B) Fetch + Combine data
  // ---------------------------------------------------
  const fetchData = useCallback(async () => {
    setIsLoading(true);

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
              const dateStr = row[1]; // e.g. "12-08"
              const timeBlock = row[3]; // e.g. "18:15"
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
      // ---------------------------------------------------
      const allDatesArray = Array.from(allDatesSet).sort();
      const tempAffected: [number, number][] = [];
      const tempNotAffected: [number, number][] = [];

      for (const dateStr of allDatesArray) {
        const [y, m, d] = dateStr.split("-");
        const yearNum = parseInt(y, 10);
        const monNum = parseInt(m, 10) - 1; // 0-based
        const dayNum = parseInt(d, 10);

        const ts = Date.UTC(yearNum, monNum, dayNum);

        // Affected
        if (aggregatorAffected[dateStr]) {
          const { sum, count } = aggregatorAffected[dateStr];
          const avg = count > 0 ? sum / count : 0;
          tempAffected.push([ts, avg]);
        } else {
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
  const chartTitle =
    "Commute times on routes expected to be Affected or Not Affected by Congestion Pricing";

  // ---------------------------------------------------
  // F) Build final series (points + best-fit lines)
  // ---------------------------------------------------
  const finalSeries: any[] = [];

  // We'll define December 25, 2024 (UTC) for splitting
  const dec25Timestamp = Date.UTC(2024, 11, 17); // 0-based => 11 = December

  // A small helper to build up to two lines for any given data set
  function buildSplitLines(
    name: string,
    color: string,
    allData: [number, number][],
    visible: boolean
  ) {
    if (!visible || allData.length === 0) return;

    // 1) Scatter points first
    finalSeries.push({
      name,
      type: "scatter",
      data: allData,
      color,
    });

    // 2) Split data into [before Dec 25] and [on/after Dec 25]
    const beforeDec25 = allData.filter(([ts]) => ts <= dec25Timestamp);
    const afterDec25 = allData.filter(([ts]) => ts >= dec25Timestamp);

    // 3) For each segment, compute the line
    if (beforeDec25.length >= 2) {
      const trendBefore = computeLineOfBestFit(beforeDec25);
      if (trendBefore.length === 2) {
        finalSeries.push({
          name: `${name} Trend (before 12/25)`,
          type: "line",
          data: trendBefore,
          color,
          stroke: { width: 2 },
          markers: { size: 0 },
          showInLegend: false,
        });
      }
    }

    if (afterDec25.length >= 2) {
      const trendAfter = computeLineOfBestFit(afterDec25);
      if (trendAfter.length === 2) {
        finalSeries.push({
          type: "line",
          data: trendAfter,
          color,
          stroke: { width: 2 },
          markers: { size: 0 },
          showInLegend: false,
        });
      }
    }
  }

  // Build "Affected" series + lines
  buildSplitLines("Affected", "#5750F1", seriesAffected, isAffectedVisible);

  // Build "Not Affected" series + lines
  buildSplitLines("Not Affected", "#FA7247", seriesNotAffected, isNotAffectedVisible);

  // ---------------------------------------------------
  // G) ApexChart styling
  // ---------------------------------------------------
  // Define the timestamp for January 5, 2025
  const jan5Timestamp = Date.UTC(2024, 11, 17); // (Was in your code) Months are 0-indexed

  // Check if data includes January 5, 2025 and at least one series is visible
  // (Leaving this as-is from your code — though note you're checking Dec 25 data instead of Jan 5.)
  const hasJan5 =
    (isAffectedVisible &&
      seriesAffected.some(([ts]) => ts === jan5Timestamp)) ||
    (isNotAffectedVisible &&
      seriesNotAffected.some(([ts]) => ts === jan5Timestamp));

  const options: ApexOptions = useMemo(
    () => ({
      chart: {
        // We use "line" so that we can do a combo (scatter + line)
        type: "line",
        height: 310,
        fontFamily: "Satoshi, sans-serif",
        toolbar: { show: false },
        zoom: { enabled: true },
        animations: {
          enabled: true,
          easing: "easeinout",
          speed: 800,
          animateGradually: {
            enabled: true,
            delay: 150,
          },
          dynamicAnimation: {
            enabled: true,
            speed: 350,
          },
        },
      },
      noData: {
        text: isLoading ? "Loading..." : "No data available",
        align: "center",
        verticalAlign: "top",
        style: {
          color: "black",
          fontSize: "24px",
          fontFamily: "Satoshi, sans-serif",
        },
      },
      // Colors will come from each series' color or default
      stroke: {
        curve: "straight", // keep best-fit lines straight
      },
      markers: {
        // For scatter series, we do see the dots.
        // For the line series, we override size=0 above.
        size: 4,
        hover: {
          size: 6,
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
        },
        y: {
          formatter: (val) =>
            typeof val === "number" ? `${val.toFixed(0)} min` : "",
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
        },
      },
      yaxis: {
        title: {
          text: "Average commute time",
        },
        labels: {
          formatter: (val) =>
            typeof val === "number" ? `${val.toFixed(0)} min` : "",
          style: {
            fontSize: "12px",
          },
        },
        min: 0,
      },
      annotations: {
        xaxis: hasJan5
          ? [
              {
                x: jan5Timestamp,
                strokeDashArray: 4,
                borderColor: "black",
                label: {
                  style: {
                    fontWeight: "bold",
                    color: "#777",
                    background: "white",
                    padding: {
                      left: 5,
                      right: 5,
                      top: 5,
                      bottom: 5,
                    },
                  },
                  text: "Congestion Pricing Start",
                  orientation: "horizontal",
                },
              },
            ]
          : [],
      },
      legend: {
        show: false, // We have our own custom legend
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
    }),
    [isLoading, hasJan5, jan5Timestamp, seriesAffected, seriesNotAffected, isAffectedVisible, isNotAffectedVisible]
  );

  // ---------------------------------------------------
  // H) Render
  // ---------------------------------------------------
  return (
    <div className="col-span-12 rounded-[10px] bg-white px-4 pb-6 pt-7.5 shadow-1 dark:bg-gray-dark dark:shadow-card">
      {/* Header & Controls */}
      <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <h4 className="text-body-2xlg font-bold text-dark dark:text-white mb-2 sm:mb-0">
          {chartTitle}
        </h4>

        <div className="flex flex-row items-center gap-4">
          {/* Custom Legend Controls */}
          <div className="flex items-center space-x-6">
            {/* Affected Legend Item */}
            <div
              role="button"
              aria-pressed={isAffectedVisible}
              className="flex items-center space-x-2 cursor-pointer"
              onClick={() => setIsAffectedVisible((prev) => !prev)}
            >
              <span
                className={`w-4 h-4 rounded-full transition-opacity duration-300 ${
                  isAffectedVisible ? "opacity-100" : "opacity-50"
                }`}
                style={{ backgroundColor: "#5750F1" }}
              ></span>
              <span className="text-sm text-gray-700 dark:text-gray-300">
                Affected
              </span>
            </div>
            {/* Not Affected Legend Item */}
            <div
              role="button"
              aria-pressed={isNotAffectedVisible}
              className="flex items-center space-x-2 cursor-pointer"
              onClick={() => setIsNotAffectedVisible((prev) => !prev)}
            >
              <span
                className={`w-4 h-4 rounded-full transition-opacity duration-300 ${
                  isNotAffectedVisible ? "opacity-100" : "opacity-50"
                }`}
                style={{ backgroundColor: "#FA7247" }}
              ></span>
              <span className="text-sm text-gray-700 dark:text-gray-300">
                Not Affected
              </span>
            </div>
          </div>

          {/* Refresh Button */}
          <button
            onClick={handleReload}
            className="flex items-center justify-center p-2 bg-gray-200 rounded hover:bg-gray-300 transition"
            aria-label="Refresh Data"
          >
            <FiRefreshCw size={20} />
          </button>
        </div>
      </div>

      {/* Chart */}
      <div className="w-full overflow-x-auto">
        <ReactApexChart
          options={options}
          series={finalSeries}
          // Overall chart type is "line" so that we can do a scatter+line combo
          type="line"
          height={310}
        />
      </div>
    </div>
  );
};

export default ChartTwo;
