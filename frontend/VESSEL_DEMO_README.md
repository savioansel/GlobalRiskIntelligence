# Vessel Tracker Demo

A lightweight, single-page React application for tracking one vessel in real-time with live alerts, war-risk zones, and geo-triggering. Designed for presentation and demo purposes.

## Features

✅ **Single-Vessel Focus**  
- Enter any MMSI to track that specific vessel
- Real-time position updates on an interactive map
- Track history with polyline visualization

✅ **Live Alerts**  
- War-risk zone entries (Red Sea, Strait of Hormuz, etc.)
- Deviation, emergency, spoofing, and reinsurance alerts
- Toast notifications for HIGH/CRITICAL severities
- Click an alert to center map on its location

✅ **Interactive Map**  
- Leaflet map with vessel marker and heading-based rotation
- War-risk zones shown as translucent circles with details
- Recent track polyline (last 30 pings)
- Auto-pan to vessel position (toggle-able)
- Alert ping markers on the map

✅ **Vessel Info Card**  
- Vessel name, MMSI, speed, course/heading
- Status indicator (underway, anchored, moored)
- Destination, cargo value, voyage ID
- Next-policy review flag

✅ **Demo/Simulation Mode**  
- If WebSocket connection fails, auto-falls back to demo mode
- Simulates realistic AIS updates with Brownian motion
- Generates random alerts and war-zone entries
- Force demo mode with a button for offline presentations

✅ **Query Parameters**  
- `?mmsi=211378120` - Set vessel MMSI
- `?ws=ws://your-server:8000/api/ais/subscribe` - Override WebSocket URL

## Tech Stack

- **React 19** with TypeScript
- **Leaflet** + **react-leaflet** for maps
- **WebSocket** for live updates
- **Tailwind CSS** for styling
- **react-hot-toast** for notifications
- **Vite** for fast development

## Quick Start

### Prerequisites

- Node.js 16+
- npm or yarn

### Installation & Setup

```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

The app will open at `http://localhost:5173/vessel-demo`

### Configuration

#### Default WebSocket URL
The app tries to connect to `ws://localhost:8000/api/ais/subscribe` by default.

**Override via query parameter:**
```
http://localhost:5173/vessel-demo?ws=ws://your-server:8000/api/ais/subscribe&mmsi=211378120
```

#### Build for Production
```bash
npm run build
```

## Usage

### Tracking a Vessel

1. Navigate to `/vessel-demo` (or click "Vessel Demo" in the sidebar)
2. Enter a vessel **MMSI** in the text input
3. Click **Track** or press Enter
4. The map will center on the vessel (if auto-pan is on)

### Demo Mode

- **Automatic**: If WebSocket connection fails, demo mode starts automatically
- **Manual**: Click **Demo Mode ON** button to force simulation mode
- In demo mode, you'll see simulated vessel updates and random alerts

### Map Controls

- **Scroll** to zoom in/out
- **Click** a war-risk zone popup to see its summary
- **Click** a vessel marker popup for detailed info
- **Click** an alert to recenter the map and disable auto-pan
- **Toggle Auto-pan** to follow or freeze the vessel position

### Alert Management

- Filter alerts by severity: ALL, CRITICAL, HIGH, MEDIUM, LOW
- Each alert shows:
  - Type (war risk, deviation, emergency, spoofing, reinsurance)
  - Severity badge
  - Message and timestamp
  - Evidence (expandable)
- Click an alert to locate it on the map

## Wire Format (WebSocket Messages)

The app expects the following JSON message formats:

### Snapshot (Initial Sync)
Sent when the client connects. Contains vessel list and recent alerts.

```json
{
  "event": "snapshot",
  "data": {
    "vessels": [
      {
        "mmsi": "211378120",
        "vessel_name": "MV Dune Spirit",
        "lat": 15.32,
        "lon": 42.45,
        "speed_kn": 18.5,
        "heading": 243,
        "course": 243,
        "status": "underway",
        "voyage_id": "VOY-211378120-001",
        "destination": "Singapore",
        "last_update": "2026-03-08T14:23:15Z",
        "next_policy_flag": false,
        "voyage_context": {
          "origin": "Shanghai",
          "destination": "Singapore",
          "cargo_value_usd": 5000000,
          "policy_id": "POL-211378120-001"
        }
      }
    ],
    "alerts": [
      {
        "alert_id": "alert_e2f8c1b4",
        "type": "war_risk",
        "mmsi": "211378120",
        "severity": "HIGH",
        "msg": "Vessel entered Red Sea war zone",
        "timestamp": "2026-03-08T14:23:15Z",
        "location": { "lat": 15.32, "lon": 42.45 },
        "evidence": [
          {
            "ping_id": "ping_abc123",
            "timestamp": "2026-03-08T14:23:10Z",
            "data": { "lat": 15.31, "lon": 42.44 }
          }
        ]
      }
    ]
  }
}
```

### Vessel Update
Sent whenever vessel position/status changes.

```json
{
  "event": "vessel.update",
  "data": {
    "mmsi": "211378120",
    "lat": 15.33,
    "lon": 42.46,
    "speed_kn": 18.6,
    "heading": 244,
    "status": "underway",
    "last_update": "2026-03-08T14:23:20Z"
  }
}
```

### Alert Create
Sent when a new alert is triggered.

```json
{
  "event": "alert.create",
  "data": {
    "alert_id": "alert_f9g1d2e5",
    "type": "deviation",
    "mmsi": "211378120",
    "severity": "MEDIUM",
    "msg": "Unexpected course change detected",
    "timestamp": "2026-03-08T14:24:00Z",
    "location": { "lat": 15.35, "lon": 42.48 },
    "evidence": [
      {
        "ping_id": "ping_def456",
        "timestamp": "2026-03-08T14:23:55Z",
        "data": { "lat": 15.34, "lon": 42.47, "course": 250 }
      }
    ]
  }
}
```

### Keepalive Ping
Sent every ~30s to keep connection alive.

```json
{
  "event": "ping",
  "data": {}
}
```

## Demo Simulator

When demo mode is active, the app uses `SimulateAIS.ts` to generate realistic messages:

- **Vessel updates** every 5–15 seconds with:
  - Small random position jumps (Brownian motion)
  - Heading changes and occasional speed variations
  - Realistic status transitions
  
- **Automatic war-zone detection**:
  - Alerts when vessel enters a conflict zone
  - Deduplicates zone-entry alerts (max 1 per 60s per zone)
  
- **Random alerts** (~10% per update):
  - Wars risk, deviation, emergency, spoofing, reinsurance types
  - Variable severity levels

- **Keepalive pings** every 30 seconds

## File Structure

```
frontend/
├── src/
│   ├── pages/
│   │   ├── VesselTrackerDemo.tsx      # Main demo page component
│   │   └── ...
│   ├── hooks/
│   │   ├── useDemoVesselTracker.ts    # WebSocket + demo mode hook
│   │   └── ...
│   ├── services/
│   │   ├── SimulateAIS.ts             # AIS simulation engine
│   │   └── ...
│   ├── App.tsx                        # Updated with /vessel-demo route
│   └── ...
├── README.md                          # This file
├── package.json
└── ...
```

## Manual Testing Checklist

- [ ] Start in demo mode and see vessel updates (5-15s intervals)
- [ ] Alerts appear in the panel and as toasts for HIGH/CRITICAL
- [ ] Click an alert to recenter map
- [ ] Toggle auto-pan and verify marker freezes/follows
- [ ] Change MMSI and see new vessel data (if connected to real backend)
- [ ] Zoom and pan the map smoothly
- [ ] War-risk zones render with correct colors and radii
- [ ] Vessel track polyline grows with each update
- [ ] Toggle demo mode button and see mode switch
- [ ] Query parameters override: `?mmsi=X&ws=wss://...`
- [ ] Connection status badge updates
- [ ] Filter alerts by severity
- [ ] Expand alert evidence pings

## Production Deployment

1. **Build the app:**
   ```bash
   npm run build
   ```

2. **Serve the `dist/` folder** using any static host or reverse proxy.

3. **Update WebSocket URL** via environment variable or query parameter:
   ```bash
   http://your-domain/vessel-demo?ws=wss://your-api:8000/api/ais/subscribe
   ```

## Limitations & Notes

- **Single MMSI only**: One vessel per page (reload to track a different vessel)
- **Demo mode on failure**: If WS connection fails, the app automatically switches to simulation
- **No authentication**: Add auth middleware if needed in production
- **War zones are static**: Hardcoded in the component; replace with API call if zones change dynamically
- **Toast style**: Minimal styling; customize via `react-hot-toast` config if needed
- **Track history**: Last 30 pings; adjust `maxTrackPoints` config if needed

## Troubleshooting

### "Waiting for vessel data..."
- Ensure MMSI is entered and valid
- If using real backend, check WebSocket URL and connection
- Try demo mode: click **Demo Mode ON**

### Map doesn't show marker
- Zoom out (scroll wheel)
- Check browser console for errors
- Verify WebSocket is sending valid GeoJSON positions

### Alerts not firing
- In demo mode, alerts are random (~10% chance per update)
- Check Leaflet console for map errors
- Verify alert times match vessel's MMSI or type (reinsurance, portfolio)

### WebSocket connection fails
- Check backend server is running on `localhost:8000`
- Verify `/api/ais/subscribe` endpoint exists
- Check browser console for CORS or connection errors
- Use demo mode as fallback

## Next Steps & Enhancements

Optional features (not required for demo):

- 🔊 Sound alerts on CRITICAL events
- 📹 Replay last 5 evidence pings as animation
- 🎯 Multiple vessel selection
- 🗺️ Dynamic war-zone updates from API
- 🔒 Bearer token authentication
- 📊 Voyage timeline and port-visit history
- 💾 Export alert log as CSV

## License

MIT (or your project's license)

## Questions?

Refer to the docstrings in:
- `SimulateAIS.ts` – Simulator logic
- `useDemoVesselTracker.ts` – Hook implementation
- `VesselTrackerDemo.tsx` – UI components

---

**Built with ❤️ for real-time maritime risk intelligence**
