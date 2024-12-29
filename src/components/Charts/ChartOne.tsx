"use client";

import React, { useState, useEffect, useRef} from "react";
import ReactApexChart from "react-apexcharts";
import { ApexOptions } from "apexcharts";
import * as XLSX from "xlsx";

// Firebase
import { db } from "@/app/firebase"; // <-- import your Firebase config
import { collection, getDocs } from "firebase/firestore";
import Buttons from "@/app/ui-elements/buttons/page";
import ButtonDefault from "../Buttons/ButtonDefault";
import { FiRefreshCw } from "react-icons/fi"; // You can choose any icon you prefer


// ---------------------------------------------------
// 1) Constants: Days of week, route options, time slots
// ---------------------------------------------------
const dayMap = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const daysOfWeek = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// Route numbers 1..19 as strings
const routeOptions = Array.from({ length: 19 }, (_, i) => `${i + 1}`);

// All 15-min increments from 00:00 to 23:45
const TIME_SLOTS_15: string[] = [];
for (let hour = 0; hour < 24; hour++) {
  for (let minute of [0, 15, 30, 45]) {
    const hh = hour.toString().padStart(2, "0");
    const mm = minute.toString().padStart(2, "0");
    TIME_SLOTS_15.push(`${hh}:${mm}`);
  }
}
console.log(TIME_SLOTS_15)

// ---------------------------------------------------
// 2) Set up cutoff times for Excel vs. Firebase
// ---------------------------------------------------
const currentYear = new Date().getFullYear(); // e.g. 2024
const excelCutoff = new Date(currentYear, 11, 29, 5, 0);    // Dec 29, 05:00
const firebaseCutoff = new Date(currentYear, 11, 29, 5, 15); // Dec 29, 05:15

const ChartOne: React.FC = () => {
  // ---------------------------------------
  // State: which route, which weekday, chart data
  // ---------------------------------------
  const [selectedRoute, setSelectedRoute] = useState("1");
  const [selectedDay, setSelectedDay] = useState("Monday");
  const [seriesData, setSeriesData] = useState<number[]>([]);
  
  // New state to control zoom
  const [zoomEnabled, setZoomEnabled] = useState(true);

  const [isZoomEnabled, setIsZoomEnabled] = useState(false);
  // ---------------------------------------
  // useEffect: Fetch from both Excel & Firebase, combine
  // ---------------------------------------
  useEffect(() => {
    const fetchData = async () => {
      try {
        // ---------------------------------------
        //  A) Initialize aggregator for 15-min slots
        // ---------------------------------------
        const aggregator: Record<string, { sum: number; count: number }> = {};
        TIME_SLOTS_15.forEach((slot) => {
          aggregator[slot] = { sum: 0, count: 0 };
        });
        console.log(aggregator)
        // ---------------------------------------
        //  B) Fetch & filter data from Excel
        // ---------------------------------------
        {
          const response = await fetch("/routes.xlsx");
          if (!response.ok) {
            console.error("Failed to fetch Excel file:", response.statusText);
          } else {
            // Parse the Excel file
            const arrayBuffer = await response.arrayBuffer();
            const workbook = XLSX.read(arrayBuffer, { type: "array" });

            // Assume data is in the first worksheet
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];

            // Convert sheet to JSON using first row as headers
            const rawRows: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            if (rawRows.length <= 1) {
              console.warn("Excel file has no data rows");
            } else {
              const headers = rawRows[0];
              const dataRows = rawRows.slice(1);

              // Create a map of column -> index
              const headerMap: Record<string, number> = {};
              headers.forEach((h: string, idx: number) => {
                headerMap[h.toString().trim().toLowerCase()] = idx;
              });

              // Iterate each row
              dataRows.forEach((row) => {
                const routeNum = row[0];
                const dateStr = row[1];       // e.g. "12-08"
                const timeBlock = row[3];     // e.g. "18:15"
                const totalMins = Number(row[4]) || 0;

                // Filter by route
                if (String(routeNum) !== selectedRoute) return;

                // Parse dateStr => mm-dd
                const [mmStr, ddStr] = String(dateStr).split("-");
                if (!mmStr || !ddStr) return;

                const mm = parseInt(mmStr, 10) - 1; // zero-based month
                const dd = parseInt(ddStr, 10);

                // Parse timeBlock => HH:MM
                const [hhStr, minStr] = String(timeBlock).split(":");
                if (!hhStr || !minStr) return;

                const hh = parseInt(hhStr, 10);
                const mn = parseInt(minStr, 10);

                // Construct JS date
                const fullDate = new Date(currentYear, mm, dd, hh, mn);
                // Only include Excel data BEFORE Dec 29 @ 5:00
                if (fullDate >= excelCutoff) return;

                // Check if day matches selectedDay
                const weekdayIndex = fullDate.getDay(); // 0=Sun,1=Mon,...
                if (dayMap[weekdayIndex] !== selectedDay) return;

                // Aggregate
                const timeSlot = `${hhStr.padStart(2, "0")}:${minStr.padStart(2, "0")}`;
                if (aggregator[timeSlot]) {
                  aggregator[timeSlot].sum += totalMins;
                  aggregator[timeSlot].count += 1;
                }
              });
            }
          }
        }

        // ---------------------------------------
        //  C) Fetch & filter data from Firebase
        // ---------------------------------------
        {
          const colRef = collection(db, selectedRoute); // e.g. "1", "2", ...
          const snapshot = await getDocs(colRef);
          snapshot.forEach((doc) => {
            // doc.id = e.g. "12_29_05-15"
            const data = doc.data();
            const totalMins = data.total_minutes ?? 0;

            const docId = doc.id; 
            // Split "MM_DD_HH-mm"
            const [mmStr, ddStr, hhMin] = docId.split("_");
            if (!mmStr || !ddStr || !hhMin) return;

            const [hhStr, minStr] = hhMin.split("-");
            if (!hhStr || !minStr) return;

            const mm = parseInt(mmStr, 10) - 1;
            const dd = parseInt(ddStr, 10);
            const hh = parseInt(hhStr, 10);
            const mn = parseInt(minStr, 10);

            // Construct JS date
            const fullDate = new Date(currentYear, mm, dd, hh, mn);
            // Only include Firebase data ON or AFTER Dec 29 @ 5:15
            if (fullDate < firebaseCutoff) return;

            // Check if day matches selectedDay
            const weekdayIndex = fullDate.getDay(); // 0=Sun,1=Mon,...
            if (dayMap[weekdayIndex] !== selectedDay) return;

            // Aggregate
            const timeSlot = `${hhStr.padStart(2, "0")}:${minStr.padStart(2, "0")}`;
            if (aggregator[timeSlot]) {
              aggregator[timeSlot].sum += totalMins;
              aggregator[timeSlot].count += 1;
            }
          });
        }

        // ---------------------------------------
        //  D) Compute averages from aggregator
        // ---------------------------------------
        const averagedData = TIME_SLOTS_15.map((slot) => {
          const { sum, count } = aggregator[slot];
          return count > 0 ? sum / count : 0;
        });
        console.log(averagedData, 'averageddata')
        setSeriesData(averagedData);
      } catch (err) {
        console.error("Error fetching data:", err);
      }
    };

    fetchData();
  }, [selectedRoute, selectedDay]);

  // ---------------------------------------
  // Format x-axis labels into “12 am, 1 am, 2 am…”
  // Only display a label at the hour boundaries (e.g., XX:00).
  // ---------------------------------------
  const xLabelFormatter = (val: string) => {
    console.log(val); // For debugging purposes
    try {
      const [hhStr, mmStr] = val.split(":");
      const hh = parseInt(hhStr, 10);
      const mm = parseInt(mmStr, 10);

      // Only display labels at hour boundaries
      if (mm !== 0) return "";

      // Convert 24-hour format to 12-hour format
      let period = "AM";
      let displayHour = hh;
      if (hh === 0) {
        displayHour = 12;
      } else if (hh === 12) {
        period = "PM";
      } else if (hh > 12) {
        displayHour = hh - 12;
        period = "PM";
      }

      return `${displayHour} ${period}`.toLowerCase(); // e.g., "12 am", "1 pm"
    } catch {
      return "";
    }
  };

  const formatTooltipTime = (val: string) => {
    const newVal = parseInt(val) - 1
    const totalMinutes = newVal * 15
    const hours = Math.floor(newVal / 4) 
    const minutes = Math.floor(totalMinutes % 60) === 0 ? "00" : Math.floor(totalMinutes % 60)
    const period = hours >= 12 ? "pm" : "am";
    const hoursFinal = hours % 12 === 0 ? 12 : hours % 12
    return `${hoursFinal}:${minutes} ${period}`;
  };
  // ---------------------------------------
  // 3) Chart config for ReactApexChart
  // ---------------------------------------
  const series = [
    {
      name: "Commute Time (min)",
      data: seriesData,
    },
  ];

  const options: ApexOptions = {
    chart: {
      zoom: {
        enabled: zoomEnabled, // Dynamic based on state
        // You can add more zoom configurations here if needed
      },
      fontFamily: "Satoshi, sans-serif",
      height: 310,
      type: "area",
      toolbar: { show: false },
    },
    legend: { show: false },
    colors: ["#5750F1"],
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
    grid: {
      strokeDashArray: 5,
      xaxis: { lines: { show: false } },
      yaxis: { lines: { show: true } },
    },
    markers: {
      size: 0,
      hover: {
        size: 5,
      },
    },
    dataLabels: {
      enabled: false,
    },
    tooltip: {
      y: {
        formatter: (val) => `${val.toFixed(0)} min`, // Round off in the tooltip as well
      },
      x: {
        formatter: (val) => formatTooltipTime(val as unknown as string),
      },
    },
    xaxis: {
      categories: TIME_SLOTS_15,
      title: { text: "Time of Day" },
      axisBorder: { show: false },
      axisTicks: { show: false },
      labels: {
        // Show custom x-axis labels
        formatter: (val) => xLabelFormatter(val as string),
      },
    },
    yaxis: {
      min: 0,
      // Let ApexCharts figure out a good max automatically.
      // Force integer (whole number) ticks only:
      labels: {
        formatter: (val) => val.toFixed(0),
      },
      title: { text: "Average Commute (min)" },
    },
    title: {
      text: `Commute times for Route ${selectedRoute} on ${selectedDay}`,
      align: "center",
      style: {
        fontSize: "14px",
        fontWeight: "bold",
      },
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
  };

  function zoomChange(){
    setZoomEnabled(false)
    setTimeout(() => setZoomEnabled(true), 500)
  }

  
  // ---------------------------------------
  // 4) UI Layout: Two dropdowns + Chart
  // ---------------------------------------
  return (
    <div className="col-span-12 rounded-[10px] bg-white px-7.5 pb-6 pt-7.5 shadow-1 dark:bg-gray-dark dark:shadow-card xl:col-span-7">
      {/* Header & Dropdowns */}
      <div className="mb-3.5 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <h4 className="text-body-2xlg font-bold text-dark dark:text-white">
          Commute Time Overview
        </h4>

        <div className="flex flex-wrap items-center gap-2.5">
          <p className="font-medium uppercase text-dark dark:text-dark-6">Route:</p>
          <select
            value={selectedRoute}
            onChange={(e) => {
              console.log(`Route changed to: ${e.target.value}`); // Debugging log
              setSelectedRoute(e.target.value);
            }}
            className="your-select-class"
          >
            {routeOptions.map((route) => (
              <option key={route} value={route}>
                {route}
              </option>
            ))}
          </select>

          <p className="font-medium uppercase text-dark dark:text-dark-6">Day:</p>
          <select
            value={selectedDay}
            onChange={(e) => {
              console.log(`Day changed to: ${e.target.value}`); // Debugging log
              setSelectedDay(e.target.value);
            }}
            className="your-select-class"
          >
            {daysOfWeek.map((day) => (
              <option key={day} value={day}>
                {day}
              </option>
            ))}
          </select>
        </div>
        
        {/* Button to Disable Zoom */}

        <button
            onClick={() => zoomChange()}
            className="ml-4 p-2 bg-gray-200 rounded hover:bg-gray-300 transition"
            aria-label="Reset Zoom"
          >
            <FiRefreshCw size={20} />
          </button>
      </div>

      {/* Chart */}
      <div className="-ml-4 -mr-5">
        <ReactApexChart options={options} series={series} type="area" height={310} />
      </div>

    </div>
  );
};

export default ChartOne;
