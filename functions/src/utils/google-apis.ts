import { Client } from "@googlemaps/google-maps-services-js";

const googleMapsClient = new Client({});
const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY || "";

// From Wikipedia, the free encyclopedia27.7375°S 152.6117°E
const IPSWICH_BOUNDS = {
  southwest: { lat: -27.7375, lng: 152.6117 },
  northeast: { lat: -27.4816, lng: 152.99 },
};

export const geocodeAddress = async (address: string) => {
  const response = await googleMapsClient.geocode({
    params: {
      address: address,
      bounds: IPSWICH_BOUNDS,
      components: {
        country: "AU",
        administrative_area: "Ipswich City",
      },
      key: googleMapsApiKey,
    },
  });

  if (response.data.results.length > 0) {
    const result = response.data.results[0];
    response.data.results.forEach((result) => {
      console.log(result.formatted_address);
    });
    return result.formatted_address;
  }
  return "";
};

export const addressForSMS = async (address: string) => {
  return (await geocodeAddress(address)).split("QLD")[0].trimEnd();
};
