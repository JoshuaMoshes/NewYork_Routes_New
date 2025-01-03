"use client";

import React, { useState, useEffect, useCallback } from "react";
import * as XLSX from "xlsx";
import { db } from "@/app/firebase";
import { collection, getDocs } from "firebase/firestore";

/** Sunday->0, Monday->1, etc. (JS Date.getDay()). */
const dayMap = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Example date dropdown: adjust or expand as needed. */
const dateOptions = [
  "2024-12-22",
  "2024-12-23",
  "2024-12-24",
  "2024-12-25",
  "2024-12-26",
  "2024-12-28",
  "2024-12-29",
  "2024-12-31",
  "2025-01-01",
  "2025-01-05",
  "2025-01-06",
  "2025-01-07",
  "2025-01-08",
  "2025-01-09",
  "2025-01-10",
  "2025-01-11",
  "2025-01-12",
  "2025-01-13",
  "2025-01-14",
  "2025-01-15",
  "2025-01-16",
  "2025-01-17",
  "2025-01-18",
  "2025-01-19",
  "2025-01-20",
  "2025-01-21",
  "2025-01-22",
  "2025-01-23",
  "2025-01-24",
  "2025-01-25",
  "2025-01-26",
  "2025-01-27",
  "2025-01-28",
  "2025-01-29",
  "2025-01-30",
  "2025-01-31",
];

/** Routes 1..19. */
const routeOptions = Array.from({ length: 19 }, (_, i) => `${i + 1}`);

/**
 * Cutoff for "pre-toll" vs "post-toll" data is 2025-01-05 (January 5, 2025).
 * All data strictly before this date is considered "pre-toll" and thus only in Excel.
 */
const january5Cutoff = new Date(2025, 0, 5);

/** Parse "YYYY-MM-DD" into a Date (midnight that day). Returns null on error. */
function parseDateFromString(dateStr: string): Date | null {
  const parts = dateStr.split("-");
  if (parts.length !== 3) return null;
  const [yyyy, mm, dd] = parts.map((p) => parseInt(p, 10));
  if (isNaN(yyyy) || isNaN(mm) || isNaN(dd)) return null;
  return new Date(yyyy, mm - 1, dd);
}

/**
 * In your Excel data, date is "MM-DD" + time "HH:MM". 
 * If month is 12 => treat as year 2024. If month is 01 => year 2025. 
 * (Adjust if your data has additional months.)
 */
function parseDateComponents(mm: number, dd: number, hh: number, mn: number) {
  // 11 => December 2024, 0 => January 2025, etc.
  // If your real data covers more months, adjust logic accordingly.
  const year = mm === 11 ? 2024 : 2025;
  return new Date(year, mm, dd, hh, mn);
}

const CommuteSentence: React.FC = () => {
  // Dropdown #1: user picks a date
  const [selectedDate, setSelectedDate] = useState("2025-01-06");

  // Dropdown #2: user picks a route
  const [selectedRoute, setSelectedRoute] = useState("1");

  // Display results
  const [differenceMinutes, setDifferenceMinutes] = useState(0);
  const [differenceWord, setDifferenceWord] = useState<"more" | "less">("more");

  const computeDifference = useCallback(async () => {
    console.log(`\nComputing difference for Date: ${selectedDate}, Route: ${selectedRoute}`);

    // 1) Parse user-selected date, figure out weekday
    const userSelectedDateObj = parseDateFromString(selectedDate);
    if (!userSelectedDateObj) {
      console.error("Invalid selected date format:", selectedDate);
      return;
    }
    const userWeekday = dayMap[userSelectedDateObj.getDay()];
    console.log("Selected weekday:", userWeekday);

    // Data structures
    /**
     * preTollDays => 
     *   key: string = "YYYY-MM-DD" (each pre-toll day that matches the same weekday)
     *   value: { sum: number; count: number }
     * We'll build up day-by-day sums, then do an average per day, then average across days.
     */
    const preTollDays: Record<string, { sum: number; count: number }> = {};

    /** aggregator for the EXACT selected day (whether from Excel or Firebase). */
    let selectedDaySum = 0;
    let selectedDayCount = 0;

    /** -------------------- PARSE EXCEL -------------------- */
    try {
      const resp = await fetch("/routes_all.xlsx");
      if (resp.ok) {
        const arrayBuffer = await resp.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rawRows: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        if (rawRows.length > 1) {
          // dataRows are all but the header
          const dataRows = rawRows.slice(1);
          dataRows.forEach((row) => {
            // row: [routeNum, dateStr (MM-DD), ???, timeBlock, totalMins, directions?]
            const routeNum = String(row[0] ?? "").trim();
            if (routeNum !== selectedRoute) return;

            const dateStr = String(row[1] ?? "").trim(); // "12-29", "01-01", etc.
            if (!dateStr || !dateStr.includes("-")) return;

            const timeBlock = String(row[3] ?? "").trim(); 
            if (!timeBlock || timeBlock.toUpperCase() === "ERROR" || !timeBlock.includes(":")) {
              // skip invalid time
              return;
            }

            const trafficStr = String(row[4] ?? "").trim(); 
            if (!trafficStr || trafficStr.toUpperCase() === "ERROR" || isNaN(+trafficStr)) {
              // skip invalid traffic
              return;
            }
            const totalMins = Number(trafficStr);
            if (totalMins >= 100) {
              // Stata: drop if traffic >= 100
              return;
            }

            // parse date "MM-DD"
            const [mmStr, ddStr] = dateStr.split("-");
            const mm = parseInt(mmStr, 10) - 1; // zero-based
            const dd = parseInt(ddStr, 10);
            if (isNaN(mm) || isNaN(dd)) return;

            // parse time "HH:MM"
            const [hhStr, mnStr] = timeBlock.split(":");
            const hh = parseInt(hhStr, 10);
            const mn = parseInt(mnStr, 10);
            if (isNaN(hh) || isNaN(mn)) return;

            const fullDate = parseDateComponents(mm, dd, hh, mn);

            // Build "YYYY-MM-DD"
            const y = fullDate.getFullYear();
            const m = String(fullDate.getMonth() + 1).padStart(2, "0");
            const d = String(fullDate.getDate()).padStart(2, "0");
            const excelDateKey = `${y}-${m}-${d}`;

            // If this row is the EXACT day user selected:
            if (excelDateKey === selectedDate) {
              selectedDaySum += totalMins;
              selectedDayCount++;
            }

            // If pre-toll AND same weekday => accumulate day sums
            // (only if fullDate < january5Cutoff)
            if (fullDate < january5Cutoff) {
              const thisWeekday = dayMap[fullDate.getDay()];
              if (thisWeekday === userWeekday) {
                if (!preTollDays[excelDateKey]) {
                  preTollDays[excelDateKey] = { sum: 0, count: 0 };
                }
                preTollDays[excelDateKey].sum += totalMins;
                preTollDays[excelDateKey].count += 1;
              }
            }
          });
        }
      } else {
        console.error("Failed to fetch /routes_all.xlsx");
      }
    } catch (err) {
      console.error("Error reading Excel data:", err);
    }

    /** -------------------- PARSE FIREBASE (only needed for the EXACT selected day) -------------------- */
    try {
      const colRef = collection(db, selectedRoute);
      const snapshot = await getDocs(colRef);

      snapshot.docs.forEach((doc) => {
        const data = doc.data();
        const totalMins = data.total_minutes ?? 0;
        if (typeof totalMins !== "number") return; // skip weird

        // doc id: "MM_DD_HH-MM"
        // e.g. "12_29_18-15"
        const docId = doc.id;
        const [mmStr, ddStr, hhMin] = docId.split("_");
        if (!mmStr || !ddStr || !hhMin) return;

        const [hhStr, mnStr] = hhMin.split("-");
        if (!hhStr || !mnStr) return;

        const mm = parseInt(mmStr, 10) - 1;
        const dd = parseInt(ddStr, 10);
        const hh = parseInt(hhStr, 10);
        const mn = parseInt(mnStr, 10);
        if ([mm, dd, hh, mn].some(isNaN)) return;

        const fullDate = parseDateComponents(mm, dd, hh, mn);
        // Build "YYYY-MM-DD"
        const y = fullDate.getFullYear();
        const m = String(fullDate.getMonth() + 1).padStart(2, "0");
        const d = String(fullDate.getDate()).padStart(2, "0");
        const fbDateKey = `${y}-${m}-${d}`;

        // Only accumulate if it matches the EXACT selected day
        if (fbDateKey === selectedDate) {
          selectedDaySum += totalMins;
          selectedDayCount++;
        }
      });
    } catch (err) {
      console.error("Error reading Firebase data:", err);
    }

    /* ------------------------------------------------------------------
       Compute the "pre-toll overall average" = 
         average of (day i's average) across all pre-toll days 
         that match the same weekday (Monday, Tuesday, etc.).
    ------------------------------------------------------------------ */
    const preTollDailyAverages: number[] = [];
    for (const dateKey of Object.keys(preTollDays)) {
      const { sum, count } = preTollDays[dateKey];
      if (count > 0) {
        preTollDailyAverages.push(sum / count); 
      }
    }
    const preTollOverallAvg =
      preTollDailyAverages.length > 0
        ? preTollDailyAverages.reduce((acc, val) => acc + val, 0) / preTollDailyAverages.length
        : 0;

    // The selected day’s average
    const selectedDayAvg = selectedDayCount > 0 ? selectedDaySum / selectedDayCount : 0;

    // difference = selectedDayAvg - preTollOverallAvg
    const diff = selectedDayAvg - preTollOverallAvg;
    const absDiff = Math.abs(diff);

    setDifferenceWord(diff < 0 ? "less" : "more");
    setDifferenceMinutes(Math.round(absDiff));

    console.log(
      `\nPre-Toll Overall Average (avg of daily avgs): ${preTollOverallAvg.toFixed(2)}\n` +
      `Selected Day Average: ${selectedDayAvg.toFixed(2)}\n` +
      `Difference => ${diff.toFixed(2)} minutes`
    );
  }, [selectedDate, selectedRoute]);

  // Run whenever user changes either dropdown
  useEffect(() => {
    computeDifference();
  }, [computeDifference]);

  return (
    <div style={{ margin: "2rem", fontSize: "1.1rem" }}>
      <p>
        On{" "}
        {/* Dropdown #1: select a date */}
        <select
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          style={{ marginRight: "0.5rem" }}
        >
          {dateOptions.map((dateStr) => (
            <option key={dateStr} value={dateStr}>
              {dateStr}
            </option>
          ))}
        </select>
        the commute from{" "}
        {/* Dropdown #2: route 1..19 */}
        <select
          value={selectedRoute}
          onChange={(e) => setSelectedRoute(e.target.value)}
          style={{ marginLeft: "0.5rem", marginRight: "0.5rem" }}
        >
          {routeOptions.map((route) => (
            <option key={route} value={route}>
              {route}
            </option>
          ))}
        </select>
        was <strong>{differenceMinutes}</strong> minutes{" "}
        <strong>{differenceWord}</strong> than before the congestion toll.
      </p>
    </div>
  );
};

export default CommuteSentence;
