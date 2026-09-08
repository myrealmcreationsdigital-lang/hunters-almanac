# HuntNav — Working Specification

**Status:** Active working document  
**Phase:** Field Prototype v0.1 / Foundation + UI North Star
**Product name:** HuntNav  
**Primary domain:** huntnav.app (owned)  
**Naming status:** Approved working name as of 2026-09-07. HuntNav supersedes HuntVector and the former Hunter’s Almanac product name. “Almanac” may remain as an in-app section/tab label.  
**Last updated:** 2026-09-07

---

## 1. Purpose

HuntNav is a field-first hunting companion app intended to combine the most useful tools a hunter would otherwise need to access across multiple separate apps.

The immediate goal is **not** a finished commercial product.

The current goal is to build a **genuinely usable field prototype for the 2026 hunting season** so it can be tested during real scouting and hunting use, then refined from actual field experience.

---

## 2. Current Project Strategy

Eidolon Messenger is being placed on a deliberate short-term pause while HuntNav moves into prototype development.

Reason:

- HuntNav has a seasonal field-testing window.
- A working prototype can be tested during the 2026 hunting season.
- Field use should inform the eventual production design and feature priorities.
- Eidolon can resume from a documented state after this prototype milestone.

---

## 3. Core Design Principle

> **The map is the workspace.**

No feature should compromise the usefulness of the primary map.

The app should avoid becoming a dashboard full of cards, banners, or permanent panels that reduce usable map area.

Secondary information should appear through compact overlays, contextual controls, bottom sheets, or dedicated screens.

---

## 4. Field Prototype v0.1 — Core Features

### Map + Location
- Live GPS position
- Property boundaries
- Topographic / elevation information
- Compass / bearing tools
- Pins / waypoints
- Photos and notes attached to pins
- Map layers
- Offline-conscious design
- Installable and usable on both Android and iPhone / iPad where platform capabilities allow

### Property Boundaries
Property lines are a **core feature**, not a later add-on.

Initial data strategy:

- Prefer authoritative public government parcel / tax GIS sources.
- Avoid dependence on commercial parcel-data subscriptions where practical.
- New York is the initial target.
- NYS statewide parcel GIS data should be used where available.
- County-specific public GIS sources may be needed where statewide redistribution is unavailable.
- Do not scrape or redistribute sources in ways that violate their terms.

Parcel UI should initially prioritize:

- Parcel boundary
- Owner
- Acreage
- Parcel ID
- Data source
- Clear disclaimer that parcel lines are not a legal survey

### Pins / Waypoints
Initial pin categories:

- Stand
- Blind
- Trail
- Scrape
- Rub
- Bedding
- Food
- Water
- Camera
- Parking
- Custom / Other

Fast field marking is important.

Desired interaction:

**+ → choose pin type → save**

Additional information such as photo, notes, observations, and other details should be optional after the pin is created.

Every saved pin should automatically retain useful context where available, including:

- Latitude / longitude
- Date / time
- Elevation

### Elevation / Terrain
Elevation is part of v0.1.

Initial functions:

- Current elevation
- Elevation stored with pins
- Topographic / contour map layer

Potential later functions:

- Elevation difference between points
- Elevation profile
- Slope
- Aspect
- Ridge / bench / saddle analysis
- Route elevation

### Compass
Compass should include a simple user-selectable mode:

- **Magnetic**
- **Satellite / GPS**

Magnetic mode uses the phone's compass / magnetometer.

Satellite / GPS mode derives travel direction from GPS movement.

The UI should always make the active mode obvious.

Do not add additional compass modes unless a real need is identified later.

### Weather / Field Conditions
Initial field information should include:

- Temperature
- Feels-like temperature
- Wind direction
- Wind speed
- Precipitation
- Barometric pressure

#### Weather Map Layers
The map weather system should support dedicated overlays without obscuring the core field map.

**Wind layer**
- Viewable from the map Layers controls
- Prefer subtle animated flowing streamlines / particles rather than static arrows alone
- Flow direction follows forecast wind direction
- Flow motion should visually reflect relative wind speed
- Must preserve visibility of parcel lines, terrain, pins, and GPS position
- Include an independent user-adjustable opacity / intensity slider
- Remember the user's last-used visual setting locally
- A lower-power/static presentation may be added for battery conservation

**Cloud layer**
- Viewable from the map Layers controls
- Semi-transparent forecast cloud-cover overlay
- Must preserve visibility of parcel lines, terrain, pins, and GPS position
- Include its own independent user-adjustable opacity slider
- Remember the user's last-used visual setting locally

**Forecast time control**
- Wind and cloud overlays should ultimately share a forecast time control so the user can scrub through expected conditions by hour.
- The visual-opacity controls affect presentation only; they do not alter the underlying weather values.

**Working U.S. data-source direction**
- Prefer NOAA / National Weather Service government data as the initial authoritative U.S. weather source.
- Verify the exact forecast-grid, wind, cloud-cover, attribution, rate-limit, and client-use contract before implementation.
- Do not introduce a paid commercial weather dependency unless the government-data path proves insufficient.

Potential later functions:
- Stand-relative wind visualization
- Route / access-wind interpretation
- Comparison of forecast wind with user-recorded local conditions
- Radar / precipitation overlay

### Sun / Moon
Initial functions:

- Sunrise
- Sunset
- Legal hunting light where rules can be calculated reliably
- Moon phase
- Moon illumination
- Moonrise
- Moonset

### Seasons / Regulations
Initial goal:

- Basic current season information
- WMU / management-unit relevance
- Regulations reference

Use authoritative current government sources.

Do not hard-code prior-year assumptions.

### Offline Use
Offline capability is a **core requirement**, not an optional enhancement.

The app should remain useful in poor or nonexistent cellular coverage.

The preferred delivery model is similar to DRO:

- Offline-first web app / PWA architecture
- Installable from the website on supported Android and iPhone / iPad devices
- Core app shell available without a network connection
- User-created data stored locally on the device by default
- No account or cloud dependency required for core field use
- Android Play Store packaging may be added later if useful
- iOS should remain usable through the installable web-app path where supported

Map, parcel, topo, and imagery caching must respect the licensing and technical rules of each underlying data source.

Longer-term possibility:

**Download Hunting Area**

Potential downloaded data:

- Basemap / topo data
- Parcel boundaries where licensing permits
- Pins
- Notes
- Essential field information

Offline caching / redistribution rights must be verified for each underlying data source.

---

## 5. UI North Star

### Overall Character

The app should feel like:

> **A modern field instrument**

Avoid stereotypical hunting-app styling such as:

- Camouflage textures
- Faux wood
- Decorative antlers everywhere
- Excessive hunter orange
- Generic outdoors-template aesthetics

### Initial Visual Direction

Potential palette direction:

- Dark forest graphite — main chrome
- Deep muted olive — secondary surfaces
- Warm brass / muted amber — selected controls and important information
- Soft off-white / parchment — high-legibility text
- Safety orange — warnings / urgent field states only
- Red — danger or destructive actions only

This direction is **not frozen** until the North Star screen is approved.

### Dark-First Design

Design dark-first because much hunting use occurs:

- Before sunrise
- At dusk
- Under canopy
- Inside vehicles
- In low-light field conditions

High contrast and legibility are more important than decorative complexity.

---

## 6. Brand / Logo Direction

The HuntNav identity should feel related to PhantaLux Studio without copying the studio logo directly.

If a star / lightburst element is used in the HuntNav logo or icon:

- Use an **8-point star**
- This should visually echo the 8-point star language of the PhantaLux Studio identity
- Avoid generic 4-point sparkle/star treatments when the star is a primary brand element
- The hunting identity should still remain distinct and field-oriented

The current antler + star concept is a promising working direction, but the final logo is **not yet frozen**.

---

## 7. Brand Lock — Approved Working Direction

The following branding direction is **approved for the current prototype and should be treated as locked unless deliberately reopened**.

### Primary Logo
Use the **Antler Star wordmark** as the main HuntNav identity.

Approved structure:
- Symmetrical antlers
- Refined, subtle **8-point star**
- `HUNTER'S ALMANAC` wordmark beneath
- Optional tagline only where space permits

The star should remain visually subordinate to the antlers and wordmark. It should feel refined and intentional rather than bright, oversized, or decorative.

### App Icon
Use the **shield + antlers + refined 8-point star** as the main app icon family.

Approved icon treatments:
1. **Rich version** — shield + antlers + star with subtle forest / mountain atmosphere in the background
2. **Simplified production version** — same shield + antlers + star on a cleaner dark forest-green background for maximum clarity at small sizes

The icon must remain recognizable even when the background detail is no longer visible.

### Secondary Badge
Use the **circular mountain / forest badge** as a secondary brand mark.

Intended uses include:
- Onboarding / welcome screens
- Splash or loading presentation
- About screen
- Marketing graphics
- Website presentation
- Almanac-themed branded moments
- Possible future stickers, patches, or merchandise

The circular badge is **not** the primary app identifier.

### Shared Brand DNA
All approved marks should share:
- Refined 8-point star language
- Brass / muted-gold metallic treatment
- Dark forest / graphite base
- Matching serif typography
- Serious field-instrument tone
- Consistent antler form where applicable

### Star Rule
The HuntNav star should:
- Use an **8-point structure**
- Visually echo the refined current PhantaLux star language
- Be **smaller and more restrained** than the earlier concept versions
- Use subdued brass contrast / glow rather than a bright starburst
- Sit slightly higher within the antlers where composition allows
- Avoid the older, brighter generic starburst treatment
- Function as a quiet navigation / guiding-star motif rather than the dominant symbol

**Current visual reference (2026-09-06):** use the latest coordinated brand-board rendition with the smaller, subtler star as the working reference for the primary logo, circular badge, and shield icon family. All other previously approved brand-family roles remain unchanged.

### Current Brand System
- **Primary identity:** Antler Star wordmark
- **App icon:** Shield + antlers + refined 8-point star
- **Secondary emblem:** Circular mountain / forest badge
- **Icon variants:** Rich atmospheric + simplified production version

Do not explore unrelated new logo directions unless the branding system is intentionally reopened.

---

## 8. Primary Navigation — Working Concept


Current working navigation:

- **MAP**
- **FIELD**
- **ALMANAC**
- **LOG**

Labels are provisional.

### MAP
Primary workspace.

Functions may include:

- Live GPS
- Parcel boundaries
- Map layers
- Topography
- Elevation
- Compass
- Pins
- Stand / blind locations
- Measurements
- Recenter / orientation controls

### FIELD
Answers:

> **What matters where I am, right now?**

Likely information:

- Weather
- Wind
- Temperature
- Pressure
- Elevation
- Sunrise / sunset
- Legal light
- Moon information
- Compass / bearings

### ALMANAC
Reference and planning information:

- Seasons
- Regulations
- Species information
- WMU information
- Calendar
- Moon information
- Hunting reference material

### LOG
Personal field history:

- Observations
- Photos
- Sightings
- Scrapes / rubs
- Hunts
- Harvest records
- Saved locations
- Trail-camera notes

---

## 9. Main Map Screen — Working Layout

The app should open directly to the map.

### Map Area
The map should occupy nearly the entire screen.

### Possible Top Status Area
Compact field status such as:

`48°F   Wind 7 mph   Sunset 7:31`

Exact content and position are not frozen.

### Map Controls
Likely controls:

- Layers
- Recenter GPS
- Compass / orientation
- Offline area / download later

### Quick Add
Prominent **+** control for fast field marking.

### Bottom Navigation
Working concept:

`MAP   FIELD   ALMANAC   LOG`

---

## 10. Map Visual Hierarchy

Initial hierarchy:

1. User GPS position
2. Property boundary
3. User-created pins / locations
4. Roads / terrain / base map detail
5. Secondary overlays

Property boundaries must remain visible over:

- Satellite imagery
- Topographic maps
- Vegetation-heavy imagery
- Dark map styles

Possible initial property-line treatment:

- Warm pale-gold boundary
- Subtle dark outline
- Light translucent fill only when a parcel is selected

This is not yet frozen and must be tested against real map imagery.

---

## 11. Parcel Interaction — Working Concept

Tap a parcel to reveal a contextual panel / bottom sheet.

Initial information:

- Owner
- Acres
- Parcel ID
- Source
- Disclaimer: not a legal survey

Avoid cluttering the field interface with unnecessary tax-record details.

---

## 12. Design System — To Be Established Before Broad Implementation

The North Star screen should establish and then freeze:

- Core palette
- Typography
- Spacing scale
- Button styles
- Icon family
- Corner radii
- Map control style
- Panel / bottom-sheet style
- Selected / active states
- Warning / danger colors
- Property-line style
- Pin icon style
- Map hierarchy
- Field information density

Once approved, new screens should reuse these elements instead of inventing new ones.

---

## 13. Current Recommended Build Order

### Phase 1 — Foundation
1. Maintain this working specification.
2. Lock Field Prototype v0.1 scope.
3. Establish navigation architecture.
4. Produce and approve one main-map North Star.
5. Convert that North Star into a small design system.

### Phase 2 — Functional Map Prototype
1. Map loads
2. Live GPS position
3. Real NYS property boundaries
4. Parcel selection
5. Topographic / elevation data
6. Compass mode selection
7. Basic pins

### Phase 3 — Field Tools
1. Pin photos / notes
2. Weather
3. Wind
4. Sun / legal light
5. Moon
6. Season / regulation reference

### Phase 4 — Field Testing
Use the prototype during scouting and hunting.

Record:

- Friction points
- Missing information
- Poor visibility
- Excessive taps
- Battery issues
- Offline failures
- Map readability
- Parcel-line usefulness
- Pin workflow usefulness

Field observations should drive the next round of development.

---

## 14. Deferred / Later Possibilities

Not part of the initial v0.1 requirement unless specifically promoted:

- Nationwide parcel normalization
- Route elevation profiles
- Slope / aspect analysis
- Stand-relative wind tools
- Advanced animal-movement prediction
- Trail-camera integrations
- Detailed harvest analytics
- Social / sharing features
- Cloud sync
- Multi-user land management
- Advanced offline map packs
- Automated parcel-boundary proximity alerts

---

## 15. Open Decisions

These still need to be resolved:

- Final visual palette
- Final map style / provider
- Final property-line color and weight
- Pin icon family
- Exact navigation labels
- Main-map control placement
- North Star screen composition
- Whether FIELD remains a dedicated tab or becomes primarily a map overlay / bottom sheet
- Exact name shown for compass mode: **Satellite** vs **GPS**
- Offline map / parcel caching approach
- First supported NY counties beyond the initial prototype area

---

## 16. Locked / Strongly Agreed Direction

The following should be treated as established unless deliberately revisited:

- HuntNav is being redesigned from the foundation up.
- Product name is **HuntNav**; it supersedes HuntVector and the former product name “Hunter’s Almanac”.
- **Almanac** may remain as an in-app section/tab label.
- The old first rendition is a reference only, not the design foundation.
- Map is the central workspace.
- Property boundaries are a core feature.
- Government parcel sources should be preferred over paid commercial parcel feeds where practical.
- Elevation belongs in v0.1.
- Compass should offer Magnetic and Satellite / GPS modes.
- Pins should support photos and notes.
- Moon information belongs in the field prototype.
- Weather map layers should include a viewable Wind overlay with subtle flowing-streamline visualization.
- Weather map layers should include a Cloud overlay where feasible.
- Wind and Cloud overlays should have separate user-adjustable opacity / intensity controls.
- Offline usefulness is important.
- The prototype should target both Android and iPhone / iPad through an installable offline-first web-app approach where feasible, similar in spirit to DRO.
- If a star effect is used in the HuntNav logo, it should be an 8-point star that echoes the refined current PhantaLux Studio identity.
- Primary logo direction is the Antler Star wordmark.
- Main app icon direction is the shield + antlers + subtle refined 8-point star.
- Keep both a rich atmospheric icon version and a simplified production icon version.
- Circular mountain / forest badge is an approved secondary emblem, not the primary app identifier.
- UI should be established early to avoid design drift later.
- Build one approved North Star screen before broad UI implementation.

---



## 17. Change Log

### 2026-09-07 — Final working rename to HuntNav
- Adopted **HuntNav** as the approved working product name.
- Confirmed ownership of **huntnav.app**.
- HuntNav supersedes **HuntVector** and **Hunter’s Almanac** as the product name.
- Preserved **Almanac** as an allowed in-app section/tab concept.
- Kept the shield + antlers + subtle refined 8-point star emblem direction and dark forest/brass visual system unchanged.



### 2026-09-07 — Product rename
- Adopted **HuntNav** as the approved working product name.
- Retired **Hunter’s Almanac** as the app/product name.
- Preserved **Almanac** as an allowed in-app section/tab concept.
- Kept the existing shield + antlers + subtle refined 8-point star emblem direction and dark forest/brass visual system unchanged.



### 2026-09-06 — Spec cleanup / weather-map decisions
- Corrected the canonical header date and top-level section numbering after the Codex read-only audit identified editorial inconsistencies.
- Added the agreed Wind map layer with subtle animated flowing streamlines / particles.
- Added the agreed Cloud map layer.
- Added independent Wind and Cloud opacity / intensity controls with locally remembered settings.
- Added the shared forecast-time-control direction for weather overlays.
- Recorded NOAA / NWS as the preferred initial U.S. weather-data direction, subject to implementation-time source-contract verification.



### 2026-09-06
- Reduced the star scale and visual intensity across the working brand family.
- Adopted the latest coordinated brand board as the current visual reference.
- Kept the existing primary logo, shield icon, and circular secondary badge roles unchanged.



### 2026-09-05
- Locked primary branding direction: Antler Star wordmark.
- Locked app icon direction: shield + antlers + subtle refined 8-point star.
- Approved both rich atmospheric and simplified production icon treatments.
- Locked circular mountain / forest badge as the secondary emblem.
- Refined the star rule so the 8-point star remains subtle and subordinate to the antlers.
- Created initial canonical working specification.
- Added Android + iPhone / iPad cross-platform requirement using an offline-first installable web-app direction similar to DRO.
- Clarified that offline capability is a core requirement.
- Added 8-point star brand direction to visually echo PhantaLux Studio when a star element is used.
- Added property boundaries as a core v0.1 feature.
- Added government-source parcel data strategy.
- Added elevation / topo requirements.
- Added Magnetic vs Satellite / GPS compass option.
- Established map-first UI direction.
- Established dark-first modern field-instrument visual direction.
- Defined provisional MAP / FIELD / ALMANAC / LOG structure.
- Defined initial prototype build order.