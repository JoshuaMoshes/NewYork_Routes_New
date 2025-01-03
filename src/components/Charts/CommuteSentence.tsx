"use client";

import React, { useState, useEffect, useCallback } from "react";
import * as XLSX from "xlsx";
import { db } from "@/app/firebase";
import { collection, getDocs } from "firebase/firestore";

/** Maps Sunday->0, Monday->1, etc. as returned by JS Date.getDay() */
const dayMap = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Dropdown for picking a date from January 6 onward (you can add more). */
const dateOptions = [
  "2024-12-23",
  "2024-12-24",
  "2024-12-25",
  "2024-12-26",
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

/** Routes 1..19 */
const routeOptions = Array.from({ length: 19 }, (_, i) => `${i + 1}`);

/** All data before this date is considered pre-toll. */
const january5Cutoff = new Date(2025, 0, 5); // 2025-01-05

/** Parse "YYYY-MM-DD" into a JavaScript Date. */
function parseDateFromString(dateStr: string): Date | null {
  const parts = dateStr.split("-");
  if (parts.length !== 3) return null;
  const [yyyy, mm, dd] = parts.map((p) => parseInt(p, 10));
  // Month is zero-based
  return new Date(yyyy, mm - 1, dd);
}

/**
 * In your Excel rows, you have a date in "MM-DD" format plus a time, e.g. "18:15".
 * We'll generate a full date for 2025. If you need different year logic, adjust here.
 */
function parseDateComponents(mm: number, dd: number, hh: number, mn: number) {
  const year = mm === 11 ? 2024 : 2025; // December is 11 (zero-based)
  const date = new Date(year, mm, dd, hh, mn);
  // console.log(`Parsed Date Components: ${date.toISOString()}`);
  return date;
}

const CommuteSentence: React.FC = () => {
  // First dropdown: user picks a day after Jan 5
  const [selectedDate, setSelectedDate] = useState("2025-01-06");

  // Second dropdown: user picks a route 1..19
  const [selectedRoute, setSelectedRoute] = useState("1");

  // Outputs in the sentence
  const [differenceMinutes, setDifferenceMinutes] = useState(0);
  const [differenceWord, setDifferenceWord] = useState<"more" | "less">("more");

  /**
   * We'll do the following steps:
   * 1) Figure out which weekday the user selected (e.g. Monday).
   * 2) From Excel, gather all pre-toll rows that match that weekday.
   *    - For each unique date (like 12-08, 12-15, etc.), we compute that date's average.
   *    - Then we take the average of all those daily averages => preTollAvgOfAverages
   * 3) From Excel + Firebase, gather all selected date rows to compute selectedDateAvg.
   * 4) difference = selectedDateAvg - preTollAvgOfAverages
   */
  const computeDifference = useCallback(async () => {
    console.log(`\nComputing difference for Date: ${selectedDate}, Route: ${selectedRoute}`);
    const userSelectedDateObj = parseDateFromString(selectedDate);
    if (!userSelectedDateObj) {
      console.error("Invalid selected date format.");
      return;
    }

    // Which weekday is it? e.g. "Monday"
    const userWeekday = dayMap[userSelectedDateObj.getDay()];
    console.log(`Selected Date Weekday: ${userWeekday}`);

    // For the final pre-toll average-of-averages (Excel only):
    const preTollDailyAggregator: Record<string, { sum: number; count: number }> = {};

    // For the selected date average (Excel + Firebase):
    let selectedDateSum = 0;
    let selectedDateCount = 0;

    /* --------------------------- PARSE EXCEL DATA --------------------------- */
    try {
      console.log("Fetching Excel data...");
      const resp = await fetch("/routes_all.xlsx");
      if (resp.ok) {
        const arrayBuffer = await resp.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rawRows: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        // rawRows[0] = headers, rawRows.slice(1) = data
        if (rawRows.length > 1) {
          const dataRows = rawRows.slice(1);
          //   console.log(`Excel Data Rows Count: ${dataRows.length}`);
          dataRows.forEach((row, index) => {
            // row format (based on your example):
            // 0: route number
            // 1: date => "MM-DD"
            // 2: "exact time" => e.g. "12-08-18-15-14" (not used directly)
            // 3: time block => e.g. "18:15"
            // 4: total minutes => e.g. 43
            // 5: route path (maybe "via Park Ave ...")

            const routeNum = String(row[0]).trim();
            const dateStr = String(row[1]).trim(); // "MM-DD"
            const timeBlock = String(row[3]).trim(); // "HH:MM"
            const totalMins = Number(row[4]) || 0;

            // Debugging: Log every N rows to avoid clutter
            if (index % 50 === 0) {
              //   console.log(`Excel Row ${index}: Route=${routeNum}, Date=${dateStr}, Time=${timeBlock}, Mins=${totalMins}`);
            }

            // If route doesn’t match user’s selected route, skip
            if (routeNum !== selectedRoute) return;

            // Parse the date
            const [mmStr, ddStr] = dateStr.split("-");
            if (!mmStr || !ddStr) return;
            const mm = parseInt(mmStr, 10) - 1; // zero-based
            const dd = parseInt(ddStr, 10);

            // Parse the time block
            const [hhStr, minStr] = timeBlock.split(":");
            if (!hhStr || !minStr) return;
            const hh = parseInt(hhStr, 10);
            const mn = parseInt(minStr, 10);

            const fullDate = parseDateComponents(mm, dd, hh, mn);

            // Determine the date key
            const yyyy = fullDate.getFullYear();
            const mmFormatted = (fullDate.getMonth() + 1).toString().padStart(2, "0");
            const ddFormatted = fullDate.getDate().toString().padStart(2, "0");
            const dateKey = `${yyyy}-${mmFormatted}-${ddFormatted}`;

            // Check if this row corresponds to the selected date
            if (dateKey === selectedDate) {
              selectedDateSum += totalMins;
              selectedDateCount++;
              //   console.log(`Updated selected date (${dateKey}): Sum=${selectedDateSum}, Count=${selectedDateCount}`);
            }

            // Pre-toll => before Jan 5, 2025
            if (fullDate < january5Cutoff) {
              // Only consider pre-toll data that matches the user's weekday
              if (dayMap[fullDate.getDay()] !== userWeekday) return;

              // Initialize aggregator if needed
              if (!preTollDailyAggregator[dateKey]) {
                preTollDailyAggregator[dateKey] = { sum: 0, count: 0 };
                //   console.log(`Initialized pre-toll aggregator for ${dateKey}`);
              }
              preTollDailyAggregator[dateKey].sum += totalMins;
              preTollDailyAggregator[dateKey].count++;
              // console.log(`Updated pre-toll aggregator for ${dateKey}: Sum=${preTollDailyAggregator[dateKey].sum}, Count=${preTollDailyAggregator[dateKey].count}`);
            }
          });
        }
      } else {
        console.error("Failed to fetch Excel file.");
      }
    } catch (err) {
      console.error("Error reading Excel data:", err);
    }

    /* -------------------------- PARSE FIREBASE DATA ------------------------- */
    try {
      console.log("Fetching Firebase data...");
      // Each route is its own collection in Firestore
      const colRef = collection(db, selectedRoute);
      const snapshot = await getDocs(colRef);
      //   console.log(`Firebase Documents Count: ${snapshot.size}`);

      // Use snapshot.docs with Array's forEach to access index if needed
      snapshot.docs.forEach((doc, index) => {
        // Debugging: Log every N documents to avoid clutter
        if (index % 50 === 0) {
          //   console.log(`Firebase Doc ${index}: ID=${doc.id}`);
        }

        const data = doc.data();
        const totalMins = data.total_minutes ?? 0;

        // You’ll need to parse doc.id accordingly:
        // e.g. "12-08_18-15" => mm = 12, dd = 08, hh=18, mn=15
        const docId = doc.id; // For example: "12-08_18-15"

        // Adjust parsing based on actual format
        const [datePart, timePart] = docId.split("_");
        if (!datePart || !timePart) {
          console.warn(`Invalid doc.id format: ${docId}`);
          return;
        }

        const [mmStr, ddStr] = datePart.split("-");
        const [hhStr, mnStr] = timePart.split("-");

        if (!mmStr || !ddStr || !hhStr || !mnStr) {
          console.warn(`Incomplete date/time in doc.id: ${docId}`);
          return;
        }

        const mm = parseInt(mmStr, 10) - 1; // zero-based
        const dd = parseInt(ddStr, 10);
        const hh = parseInt(hhStr, 10);
        const mn = parseInt(mnStr, 10);

        const fullDate = parseDateComponents(mm, dd, hh, mn);

        // Determine the date key
        const yyyy = fullDate.getFullYear();
        const mmFormatted = (fullDate.getMonth() + 1).toString().padStart(2, "0");
        const ddFormatted = fullDate.getDate().toString().padStart(2, "0");
        const dateKey = `${yyyy}-${mmFormatted}-${ddFormatted}`;

        // Only process data for the selected date
        if (dateKey !== selectedDate) return;

        // Only consider data that matches the user's weekday
        if (dayMap[fullDate.getDay()] !== userWeekday) return;

        selectedDateSum += totalMins;
        selectedDateCount++;
        // console.log(`Updated selected date from Firebase (${dateKey}): Sum=${selectedDateSum}, Count=${selectedDateCount}`);
      });
    } catch (err) {
      console.error("Error reading Firebase data:", err);
    }

    /* --------------------- COMPUTE PRE-TOLL AVERAGE-OF-AVERAGES --------------------- */

    // For each date in preTollDailyAggregator, get that date’s average
    let sumOfDailyAverages = 0;
    let numDates = 0;
    Object.keys(preTollDailyAggregator).forEach((dateKey) => {
      const { sum, count } = preTollDailyAggregator[dateKey];
      if (count > 0) {
        const dailyAvg = sum / count; // average for that day
        sumOfDailyAverages += dailyAvg;
        numDates++;
      }
    });

    const preTollAvgOfAverages = numDates > 0 ? sumOfDailyAverages / numDates : 0;
    console.log(`Pre-Toll Avg of Averages (Excel only): ${preTollAvgOfAverages}`);

    /* --------------------- COMPUTE SELECTED DATE AVERAGE --------------------- */
    const selectedDateAvg = selectedDateCount > 0 ? selectedDateSum / selectedDateCount : 0;
    console.log(`Selected Date Avg (Excel + Firebase): ${selectedDateAvg}`);

    /* --------------------- FINAL DIFFERENCE --------------------- */
    // difference = (selectedDateAvg - preTollAvgOfAverages)
    const diff = selectedDateAvg - preTollAvgOfAverages;
    const absDiff = Math.abs(diff);

    // If diff < 0 => "less", else "more"
    setDifferenceWord(diff < 0 ? "less" : "more");
    setDifferenceMinutes(Math.round(absDiff));

    console.log(`Difference: ${diff} (${diff < 0 ? "less" : "more"}), Minutes: ${Math.round(absDiff)}`);
  }, [selectedDate, selectedRoute]);

  // Recompute whenever user changes either dropdown
  useEffect(() => {
    computeDifference();
  }, [computeDifference]);

  return (
    <div style={{ margin: "2rem", fontSize: "1.1rem" }}>
      <p>
        On{" "}
        {/* Dropdown #1: choose a date after Jan 5 */}
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
