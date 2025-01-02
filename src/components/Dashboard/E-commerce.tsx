"use client";
import React from "react";
import ChartOne from "@/components/Charts/ChartOne";
import ChartTwo from "@/components/Charts/ChartTwo";
import MapOne from "../Maps/MapOne";
import MapEmbedComponent from "../Maps/MapEmbedComponent";

const ECommerce: React.FC = () => {
  return (
    <div className="container mx-auto px-2 py-6">
      {/* Title */}
      <h1 className="text-4xl font-bold text-center mb-3">
      Congestion Pricing Tracker
      </h1>

      {/* Subheading */}
      <h2 className="text-2xl font-semibold text-center mb-8">
      Cool Text Here with Routes
      </h2>

      {/* Charts Section */}
      <div className="flex flex-col -mx-2 mb-10">
        {/* Chart One */}
        <div className="w-full px-2 mb-4">
          <div className="bg-white shadow-md rounded-md p-4 h-full">
            <ChartOne />
          </div>
        </div>

        {/* Chart Two */}
        <div className="w-full px-2">
          <div className="bg-white shadow-md rounded-md p-4 h-full">
            <ChartTwo />
          </div>
        </div>
      </div>

      {/* Boxes Container */}
      <div className="flex flex-wrap -mx-2">
        {/* Box 1: Text */}
        <div className="w-full md:w-1/2 px-2 mb-4">
          <div className="bg-white shadow-md rounded-md p-4 h-full flex flex-col justify-center">
            <h3 className="text-xl font-semibold mb-1">Info</h3>
            <p className="text-gray-700 text-sm">
            <br />
            New York City is launching a congestion pricing program aimed at reducing traffic congestion in Manhattan below 60th Street.
            A base toll of $9 will be charged daily for vehicle entry into the congestion zone, with varying increased fees applied to small and large trucks, and a decreased fee for motorcycles.
            <br /><br />
            Excluded from the toll are FDR Drive, the West Side Highway and the Hugh L. Carey Tunnel connecting to West Street.
            Aims of the program include reducing travel time and emissions, and raising money for the New York City transportation system.
            <br /><br />
            Figure 1 displays a map of the Congestion Zone in Manhattan.
            </p>
          </div>
        </div>

        {/* Box 2: Image */}
        <div className="w-full md:w-1/2 px-2 mb-4">
        <div className="bg-white shadow-md rounded-md p-4 h-full flex flex-col justify-center">
                    <MapEmbedComponent />

          </div>
        </div>

        {/* Box 3: Image */}
        <div className="w-full md:w-1/2 px-2 mb-4">
        <div className="bg-white shadow-md rounded-md p-4 h-full flex flex-col justify-center">
            <img
              src="https://via.placeholder.com/600x400"
              className="w-full h-48 object-cover"
            />
          </div>
        </div>

        {/* Box 4: Text */}
        <div className="w-full md:w-1/2 px-2 mb-4">
          <div className="bg-white shadow-md rounded-md p-4 h-full flex flex-col justify-center">
            <h3 className="text-xl font-semibold mb-1">Fast Delivery</h3>
            <p className="text-gray-700 text-sm">
              Enjoy swift and reliable delivery services that ensure your products arrive on time, every time.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ECommerce;
