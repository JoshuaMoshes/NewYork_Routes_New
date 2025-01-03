"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import ReactApexChart from "react-apexcharts";
import { ApexOptions } from "apexcharts";
import * as XLSX from "xlsx";
import { db } from "@/app/firebase";
import { collection, getDocs } from "firebase/firestore";
import { FiRefreshCw } from "react-icons/fi";

// Define the titles for each route, ignoring any text in parentheses
const routeTitles = [
  "Lenox Hill to Battery Park", // Route 1
  "Hell's Kitchen to Midtown East", // Route 2
  "Chelsea to Kips Bay", // Route 3
  "Greenwich Village to Alphabet City", // Route 4
  "Tribeca to Lower East Side", // Route 5
  "Lincoln Tunnel", // Route 6
  "Holland Tunnel", // Route 7
  "Huel L Cary Tunnel", // Route 8
  "Brooklyn Bridge", // Route 9
  "Manhattan Bridge", // Route 10
  "Williamsburg Bridge", // Route 11
  "Queens-Midtown Tunnel", // Route 12
  "Queensboro Bridge", // Route 13
  "FDR Drive", // Route 14
  "East Harlem to Longwood", // Route 15
  "Coolidge Corner to Boston City Hall", // Route 16
  "Washington Heights to Lenox Hill", // Route 17
  "River North to Motor Row District", // Route 18
  "Park Slope to Dumbo", // Route 19
];

const dayMap = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const daysOfWeek = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// Update routeOptions to include both value and label
const routeOptions = Array.from({ length: 19 }, (_, i) => ({
  value: `${i + 1}`,
  label: `Route ${i + 1}: ${routeTitles[i]}`,
}));

const TIME_SLOTS_15: string[] = [];
for (let hour = 0; hour < 24; hour++) {
  for (let minute of [0, 15, 30, 45]) {
    const hh = hour.toString().padStart(2, "0");
    const mm = minute.toString().padStart(2, "0");
    TIME_SLOTS_15.push(`${hh}:${mm}`);
  }
}

function parseDate(mm: number, dd: number, hh: number, mn: number) {
  if (mm >= 3) {
    return new Date(2024, mm, dd, hh, mn);
  } else {
    return new Date(2025, mm, dd, hh, mn);
  }
}

const jan5thCutoff = parseDate(0, 5, 0, 0); // January is month 0

const ChartOne: React.FC = () => {
  const [selectedRoute, setSelectedRoute] = useState("");
  const [selectedDay, setSelectedDay] = useState("");
  const [seriesDataBefore, setSeriesDataBefore] = useState<number[]>([]);
  const [seriesDataAfter, setSeriesDataAfter] = useState<number[]>([]);
  const [zoomEnabled, setZoomEnabled] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [labelFrequency, setLabelFrequency] = useState(1);

  useEffect(() => {
    const updateLabelFrequency = () => {
      const width = window.innerWidth;
      if (width < 640) {
        setLabelFrequency(6);
      } else if (width < 1024) {
        setLabelFrequency(4);
      } else if (width < 2000) {
        setLabelFrequency(2);
      } else {
        setLabelFrequency(1);
      }
    };
    updateLabelFrequency();
    window.addEventListener("resize", updateLabelFrequency);
    return () => window.removeEventListener("resize", updateLabelFrequency);
  }, []);

  const fetchData = useCallback(async () => {
    // Only fetch data if both route and day are selected
    if (!selectedRoute || !selectedDay) {
      setSeriesDataBefore([]);
      setSeriesDataAfter([]);
      return;
    }

    setIsLoading(true);
    try {
      // Initialize two separate aggregators
      const aggregatorBefore: Record<string, { sum: number; count: number }> = {};
      const aggregatorAfter: Record<string, { sum: number; count: number }> = {};
      TIME_SLOTS_15.forEach((slot) => {
        aggregatorBefore[slot] = { sum: 0, count: 0 };
        aggregatorAfter[slot] = { sum: 0, count: 0 };
      });

      // Fetch from Excel
      const response = await fetch("/routes_all.xlsx");
      if (response.ok) {
        const arrayBuffer = await response.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rawRows: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        if (rawRows.length > 1) {
          const headers = rawRows[0];
          const dataRows = rawRows.slice(1);
          const headerMap: Record<string, number> = {};
          headers.forEach((h: string, idx: number) => {
            headerMap[h.toString().trim().toLowerCase()] = idx;
          });
          dataRows.forEach((row) => {
            const routeNum = row[0];
            const dateStr = row[1];
            const timeBlock = row[3];
            const totalMins = Number(row[4]) || 0;
            if (String(routeNum) !== selectedRoute) return;
            const [mmStr, ddStr] = String(dateStr).split("-");
            if (!mmStr || !ddStr) return;
            const mm = parseInt(mmStr, 10) - 1;
            const dd = parseInt(ddStr, 10);
            const [hhStr, minStr] = String(timeBlock).split(":");
            if (!hhStr || !minStr) return;
            const hh = parseInt(hhStr, 10);
            const mn = parseInt(minStr, 10);
            const fullDate = parseDate(mm, dd, hh, mn);
            // Remove or adjust existing cutoff checks if not needed
            // if (fullDate >= excelCutoff) return;
            const weekdayIndex = fullDate.getDay();
            if (dayMap[weekdayIndex] !== selectedDay) return;
            const timeSlot = `${hhStr.padStart(2, "0")}:${minStr.padStart(2, "0")}`;
            if (fullDate < jan5thCutoff) {
              // Aggregate for before Jan 5th
              if (aggregatorBefore[timeSlot]) {
                aggregatorBefore[timeSlot].sum += totalMins;
                aggregatorBefore[timeSlot].count += 1;
              }
            } else {
              // Aggregate for on/after Jan 5th
              if (aggregatorAfter[timeSlot]) {
                aggregatorAfter[timeSlot].sum += totalMins;
                aggregatorAfter[timeSlot].count += 1;
              }
            }
          });
        }
      }

      // Fetch from Firebase
      const colRef = collection(db, selectedRoute);
      const snapshot = await getDocs(colRef);
      snapshot.forEach((doc) => {
        const data = doc.data();
        const totalMins = data.total_minutes ?? 0;
        const docId = doc.id;
        const [mmStr, ddStr, hhMin] = docId.split("_");
        if (!mmStr || !ddStr || !hhMin) return;
        const [hhStr, minStr] = hhMin.split("-");
        if (!hhStr || !minStr) return;
        const mm = parseInt(mmStr, 10) - 1;
        const dd = parseInt(ddStr, 10);
        const hh = parseInt(hhStr, 10);
        const mn = parseInt(minStr, 10);
        const fullDate = parseDate(mm, dd, hh, mn);
        // Remove or adjust existing cutoff checks if not needed
        // if (fullDate < firebaseCutoff) return;
        const weekdayIndex = fullDate.getDay();
        if (dayMap[weekdayIndex] !== selectedDay) return;
        const timeSlot = `${hhStr.padStart(2, "0")}:${minStr.padStart(2, "0")}`;
        if (fullDate < jan5thCutoff) {
          // Aggregate for before Jan 5th
          if (aggregatorBefore[timeSlot]) {
            aggregatorBefore[timeSlot].sum += totalMins;
            aggregatorBefore[timeSlot].count += 1;
          }
        } else {
          // Aggregate for on/after Jan 5th
          if (aggregatorAfter[timeSlot]) {
            aggregatorAfter[timeSlot].sum += totalMins;
            aggregatorAfter[timeSlot].count += 1;
          }
        }
      });

      // Compute averaged data for both datasets
      const averagedDataBefore = TIME_SLOTS_15.map((slot) => {
        const { sum, count } = aggregatorBefore[slot];
        return count > 0 ? sum / count : 0;
      });

      const averagedDataAfter = TIME_SLOTS_15.map((slot) => {
        const { sum, count } = aggregatorAfter[slot];
        return count > 0 ? sum / count : 0;
      });

      // Update state with both datasets
      setSeriesDataBefore(averagedDataBefore);
      setSeriesDataAfter(averagedDataAfter);
    } catch (err) {
      console.error("Error fetching data:", err);
    } finally {
      setIsLoading(false);
    }
  }, [selectedRoute, selectedDay]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const xLabelFormatter = (val: string) => {
    try {
      const [hhStr, mmStr] = val.split(":");
      const hh = parseInt(hhStr, 10);
      const mm = parseInt(mmStr, 10);
      if (mm !== 0 || hh % labelFrequency !== 0) return "";
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
      return `${displayHour} ${period}`.toLowerCase();
    } catch {
      return "";
    }
  };

  const formatTooltipTime = (val: string) => {
    const newVal = parseInt(val) - 1;
    const totalMinutes = newVal * 15;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60 === 0 ? "00" : (totalMinutes % 60).toString().padStart(2, "0");
    const period = hours >= 12 ? "pm" : "am";
    const hoursFinal = hours % 12 === 0 ? 12 : hours % 12;
    return `${hoursFinal}:${minutes} ${period}`;
  };

  const series = [
    {
      name: "Before Jan 5th",
      data: seriesDataBefore,
    },
    {
      name: "Jan 5th and After",
      data: seriesDataAfter,
    },
  ];

  // Memoize the options to handle dynamic noData.text
  const options: ApexOptions = useMemo(() => {
    let noDataText = "Please select both route and day";
    if (selectedRoute && selectedDay) {
      if (isLoading) {
        noDataText = "Loading...";
      } else {
        // Check if both series have no data (all zeros)
        const hasDataBefore = seriesDataBefore.some((value) => value > 0);
        const hasDataAfter = seriesDataAfter.some((value) => value > 0);
        if (!hasDataBefore && !hasDataAfter) {
          noDataText = "No Data";
        }
      }
    }

    return {
      chart: {
        zoom: {
          enabled: zoomEnabled,
        },
        fontFamily: "Satoshi, sans-serif",
        height: 310,
        type: "area",
        toolbar: { show: false },
        animations: {
          enabled: true,
          easing: "easeinout",
          speed: 800,
          animateGradually: { enabled: true, delay: 150 },
          dynamicAnimation: { enabled: true, speed: 350 },
        },
      },
      noData: {
        text: noDataText,
        align: "center",
        verticalAlign: "middle",
        style: {
          color: "black",
          fontSize: "24px",
          fontFamily: "Satoshi, sans-serif",
        },
      },
      legend: { show: true }, // Enable legend to differentiate between the two series
      colors: ["#5750F1", "#FF5733"], // Assign distinct colors for each series
      fill: {
        type: "gradient",
        gradient: { shadeIntensity: 1, opacityFrom: 0.55, opacityTo: 0, stops: [0, 90, 100] },
      },
      stroke: { curve: "smooth" },
      grid: {
        strokeDashArray: 5,
        xaxis: { lines: { show: false } },
        yaxis: { lines: { show: true } },
      },
      markers: { size: 0, hover: { size: 5 } },
      dataLabels: { enabled: false },
      tooltip: {
        y: {
          formatter: (val) => `${val.toFixed(0)} min`,
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
          formatter: (val) => xLabelFormatter(val as string),
          style: { fontSize: "12px" },
        },
      },
      yaxis: {
        min: 0,
        labels: {
          formatter: (val) => val.toFixed(0),
          style: { fontSize: "12px" },
        },
        title: { text: "Average Commute (min)" },
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
  }, [
    isLoading,
    selectedRoute,
    selectedDay,
    seriesDataBefore,
    seriesDataAfter,
    zoomEnabled,
    xLabelFormatter,
    formatTooltipTime,
  ]);

  function zoomChange() {
    setZoomEnabled(false);
    setTimeout(() => setZoomEnabled(true), 500);
  }

  const handleReload = () => {
    setSeriesDataBefore([]);
    setSeriesDataAfter([]);
    fetchData();
  };

  return (
    <div className="col-span-12 rounded-[10px] bg-white px-4 pb-6 pt-7.5 shadow-1 dark:bg-gray-dark dark:shadow-card xl:col-span-7">
      <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <h4 className="text-body-2xlg font-bold text-dark dark:text-white mb-2 sm:mb-0 flex items-center flex-wrap">
          <span>Commute times for </span>
          {/* Route Dropdown */}
          <select
            aria-label="Select Route"
            value={selectedRoute}
            onChange={(e) => {
              setSelectedRoute(e.target.value);
            }}
            className="mx-2 border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-transparent"
          >
            <option value="" disabled>
              Select Route
            </option>
            {routeOptions.map((route) => (
              <option key={route.value} value={route.value}>
                {route.label}
              </option>
            ))}
          </select>
          <span> on </span>
          {/* Day Dropdown */}
          <select
            aria-label="Select Day"
            value={selectedDay}
            onChange={(e) => {
              setSelectedDay(e.target.value);
            }}
            className="mx-2 border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-transparent"
          >
            <option value="" disabled>
              Select Day
            </option>
            {daysOfWeek.map((day) => (
              <option key={day} value={day}>
                {day}
              </option>
            ))}
          </select>
        </h4>
        <button
          onClick={handleReload}
          className="flex items-center justify-center p-2 bg-gray-200 rounded hover:bg-gray-300 transition mt-2 sm:mt-0"
          aria-label="Refresh Data"
        >
          <FiRefreshCw size={20} />
        </button>
      </div>
      <div className="w-full overflow-x-auto">
        <ReactApexChart options={options} series={series} type="area" height={310} />
      </div>
    </div>
  );
};

export default ChartOne;
