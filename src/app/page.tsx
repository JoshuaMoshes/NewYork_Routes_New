import ECommerce from "@/components/Dashboard/E-commerce";
import { Metadata } from "next";
import DefaultLayout from "@/components/Layouts/DefaultLaout";

import React from "react";

export const metadata: Metadata = {
  title:
    "Congestion Pricing Tracker | Benjamin and Joshua Moshes",
  description: "This project is run by Joshua Moshes and Benjamin Moshes, under the supervision of Brown University Professor Emily Oster",
  authors: [{name: "Joshua Moshes", url:"CongestionPricingTracker.com"}],
  icons: [
    { rel: "icon", url: "/images/favicon.ico" },
    // { rel: "icon", url: "/icons/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    // { rel: "icon", url: "/icons/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    // { rel: "apple-touch-icon", url: "/icons/apple-touch-icon.png", sizes: "180x180" },
    // Add more as needed
  ],
};

export default function Home() {
  return (
    <>
      <ECommerce>
        {/* <ECommerce /> */}
        {/* <ChartOne /> */}
      </ECommerce>
      
    </>
  );
}
