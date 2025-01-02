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
            <h3 className="text-xl font-semibold mb-1">About Congestion Pricing</h3>
            <p className="text-gray-700 text-sm">
            <br />
            New York City is launching a congestion pricing program aimed at reducing traffic congestion in Manhattan below 60th Street. A base toll of $9 will be charged daily for vehicle entry into the congestion zone, with varying increased fees applied to small and large trucks, and a decreased fee for motorcycles.
            <br /><br />
            Fees are discounted by 75% during the off-peak hours of 9pm - 5am. Excluded from the toll are FDR Drive, the West Side Highway and the Hugh L. Carey Tunnel connecting to West Street. Aims of the program include reducing travel time and emissions, and raising money for the New York City transportation system.
            <br /><br />
            Figure 1 displays a map of the Congestion Zone in Manhattan. You can view full details of the program on the official NYC website here. You can view the bounds of the Congestion Zone in Figure 1.             </p>
          </div>
        </div>

        {/* Box 2: Image */}
        <div className="w-full md:w-1/2 px-2 mb-4">
  <div className="bg-white shadow-md rounded-md p-4 h-full flex flex-col justify-center">
    <img
      src="images/congestion_map.jpg"
      className="w-full h-full object-cover"
      alt="Congestion Zone Map"
    />
    {/* Source Attribution */}
    <div className="mt-2 text-sm text-gray-500">
      Source:{" "}
      <a
        href="https://congestionreliefzone.mta.info/"
        target="_blank"
        rel="noopener noreferrer"
        className="text-gray-500 hover:text-blue-500 hover:underline transition-colors duration-200"
      >
        MTA
      </a>
    </div>
  </div>
</div>



        {/* Box 3: Map Embed */}
        <div className="w-full md:w-1/2 px-2 mb-4">
          <div className="bg-white shadow-md rounded-md p-4 h-full flex flex-col justify-center">
            <MapEmbedComponent />
          </div>
        </div>

        {/* Box 4: Text */}
        <div className="w-full md:w-1/2 px-2 mb-4">
          <div className="bg-white shadow-md rounded-md p-4 h-full flex flex-col justify-center">
            <h3 className="text-xl font-semibold mb-1">About the Congestion Pricing Tracker</h3>
            <p className="text-gray-700 text-sm">
            <br />
            The Congestion Pricing Tracker was created to measure the impact of congestion pricing on vehicle travel times in New York City. To do this, we collected Google Maps traffic data for 19 routes, finding the shortest time to drive from Point A to Point B for every route for 15 minute intervals every day.
            <br /><br />
            Most of the route data we have been collecting were ones directly affected by congestion pricing (Routes 1-13). Route 14 measures congestion on FDR drive, which is excluded from congestion pricing. Routes 15, 17 and 19 are routes within New York City, but outside of the congestion zone, to measure the effect of congestion pricing for those commutes.
            <br /><br />
            Routes 16 and 18 are control routes, running in Boston and Chicago, respectively, acting as a control. You can view the routes data was collected for in Figure 2. 
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ECommerce;
