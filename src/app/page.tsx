import ECommerce from "@/components/Dashboard/E-commerce";
import { Metadata } from "next";
import DefaultLayout from "@/components/Layouts/DefaultLaout";

import React from "react";

export const metadata: Metadata = {
  title: "Congestion Pricing Tracker | Benjamin and Joshua Moshes",
  description:
    "This project is run by Joshua Moshes and Benjamin Moshes, under the supervision of Brown University Professor Emily Oster",
  authors: [{ name: "Joshua Moshes", url: "https://CongestionPricingTracker.com" }],
  icons: [{ rel: "icon", url: "/images/favicon.ico" }],
};

export default function Home() {
  return (
    <>
      <ECommerce />
    </>
  );
}
