// src/components/MapEmbedComponent.tsx

import React from 'react';

const MapEmbedComponent: React.FC = () => {
  return (
    <div style={{ width: '100%', height: '350px' }}>
      {/* <h2>NYC Congestion Pricing Routes</h2> */}
      <iframe
        src="/maps/nyc_congestion_pricing_routes_updated.html" // Path to the HTML map
        width="100%"
        height="350px"
        style={{ border: 'none' }}
        title="NYC Congestion Pricing Routes Map"
      ></iframe>
    </div>
  );
};

export default MapEmbedComponent;
