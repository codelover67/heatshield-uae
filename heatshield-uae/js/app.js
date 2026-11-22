// Grab the page elements by their ids
const citySelect = document.getElementById("city");
const shiftStartInput = document.getElementById("shiftStart"); // NEW
const shiftEndInput = document.getElementById("shiftEnd");     // NEW
const checkBtn = document.getElementById("checkBtn");
const statusText = document.getElementById("status");
const summaryText = document.getElementById("summary");        // NEW
const resultsList = document.getElementById("results");

// Ask Open-Meteo for today's hourly temperature and humidity
async function getWeather(lat, lon) {
  const url =
    "https://api.open-meteo.com/v1/forecast" +
    "?latitude=" + lat +
    "&longitude=" + lon +
    "&hourly=temperature_2m,relative_humidity_2m" +
    "&timezone=auto&forecast_days=1";

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Weather service error");
  }
  const data = await response.json();

  const hours = [];
  for (let i = 0; i < data.hourly.time.length; i++) {
    hours.push({
      time: data.hourly.time[i],
      temp: data.hourly.temperature_2m[i],
      humidity: data.hourly.relative_humidity_2m[i]
    });
  }
  return hours;
}

// Calculate the "feels like" heat index in °C (US National Weather Service formula)
function calcHeatIndex(tempC, humidity) {
  const T = tempC * 9 / 5 + 32; // °C to °F
  const R = humidity;

  let hi = 0.5 * (T + 61.0 + ((T - 68.0) * 1.2) + (R * 0.094));

  if ((hi + T) / 2 >= 80) {
    hi = -42.379
      + 2.04901523 * T
      + 10.14333127 * R
      - 0.22475541 * T * R
      - 0.00683783 * T * T
      - 0.05481717 * R * R
      + 0.00122874 * T * T * R
      + 0.00085282 * T * R * R
      - 0.00000199 * T * T * R * R;

    if (R < 13 && T >= 80 && T <= 112) {
      hi -= ((13 - R) / 4) * Math.sqrt((17 - Math.abs(T - 95)) / 17);
    } else if (R > 85 && T >= 80 && T <= 87) {
      hi += ((R - 85) / 10) * ((87 - T) / 5);
    }
  }

  return (hi - 32) * 5 / 9; // °F back to °C
}

// Turn a heat index into a risk level
function getRisk(heatIndexC) {
  if (heatIndexC >= 41) {
    return { level: "red", label: "Danger" };
  } else if (heatIndexC >= 32) {
    return { level: "amber", label: "Caution" };
  } else {
    return { level: "green", label: "Safe" };
  }
}

// NEW: is this hour (0-23) inside the shift?
// Also works for night shifts, like 22 to 6.
function isInShift(hour, start, end) {
  if (start < end) {
    return hour >= start && hour < end;
  } else {
    return hour >= start || hour < end;
  }
}

// When the button is clicked: fetch weather, keep shift hours, show risk
checkBtn.addEventListener("click", async function () {
  const parts = citySelect.value.split(",");
  const lat = parts[0];
  const lon = parts[1];

  // NEW: read the shift hours the user typed
  const shiftStart = Number(shiftStartInput.value);
  const shiftEnd = Number(shiftEndInput.value);

  // NEW: stop if the hours are not valid
  if (
    shiftStartInput.value === "" || shiftEndInput.value === "" ||
    shiftStart < 0 || shiftStart > 23 ||
    shiftEnd < 0 || shiftEnd > 23 ||
    shiftStart === shiftEnd
  ) {
    statusText.textContent = "Please enter a shift start and end between 0 and 23 (they can't be the same).";
    summaryText.textContent = "";
    resultsList.innerHTML = "";
    return;
  }

  statusText.textContent = "Loading...";
  summaryText.textContent = "";
  resultsList.innerHTML = "";

  try {
    const hours = await getWeather(lat, lon);
    statusText.textContent = "Your shift (" + shiftStart + ":00 to " + shiftEnd + ":00):";

    let worst = null; // NEW: remembers the hottest hour

    for (const h of hours) {
      const hourNumber = Number(h.time.split("T")[1].split(":")[0]); // NEW
      if (!isInShift(hourNumber, shiftStart, shiftEnd)) {
        continue; // NEW: skip hours outside the shift
      }

      const heatIndex = calcHeatIndex(h.temp, h.humidity);
      const risk = getRisk(heatIndex);

      if (worst === null || heatIndex > worst.heatIndex) { // NEW
        worst = { time: h.time.split("T")[1], heatIndex: heatIndex, risk: risk };
      }

      const li = document.createElement("li");
      li.className = risk.level;
      const hour = h.time.split("T")[1];
      li.textContent =
        hour + " - " + risk.label +
        " (feels like " + heatIndex.toFixed(1) + "°C, " +
        "actual " + h.temp + "°C, " + h.humidity + "% humidity)";
      resultsList.appendChild(li);
    }

    // NEW: show the worst hour of the shift
    if (worst !== null) {
      summaryText.textContent =
        "Worst hour of your shift: " + worst.time + " - " + worst.risk.label +
        " (feels like " + worst.heatIndex.toFixed(1) + "°C)";
    }
  } catch (error) {
    statusText.textContent = "Could not load weather. Check your internet and try again.";
    console.error(error);
  }
});