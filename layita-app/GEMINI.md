System Spec: ECD Monitoring & Evaluation Portal
1. Project Overview
This application is a centralized M&E platform for a small NGO to track and evaluate Early Childhood Development Centres (ECDCs). The goal is to provide data-driven insights through geographic visualization and detailed outreach tracking.

2. Design & Aesthetics
Theme: Minimalist / Professional.

Color Palette: Primary White (#FFFFFF), Light Grey Borders (#E5E7EB), and High-Contrast Text.

Layout: Sidebar navigation for internal pages, responsive for tablet use in the field.

3. Page Specifications
A. Authentication (Login)
Constraint: No Sign-Up functionality. Users are pre-provisioned by administrators.

Fields: Email/Username and Password.

Logic: Redirect to Overview upon successful auth; 401 Error for unauthorized attempts.

B. Overview Dashboard (The Map)
The primary entry point for situational awareness.

Map Component: An interactive map (Leaflet or Google Maps API) displaying pins for all registered ECDCs.

KPI Tiles: * Total ECDCs Tracked.

Total Children Enrolled.

Outreach Visits this Month.

Filters: Filter map pins by "Status" (Registered vs. Unregistered) or "Region."

C. ECDC Drill-Down Page
Detailed view of a specific center triggered by clicking a map pin or searching.

Profile Section: Name, Principal, Contact Info, and Capacity.

Compliance Checklist: Visual indicators for health, safety, and curriculum standards.

Historical Data: A list of past assessments and their scores.

D. Outreach Tracker
A chronological log of NGO activity in the field.

List View: Displays date, ECDC visited, staff member responsible, and a brief summary of the visit.

Add Visit Button: Leads to a simple form to log new interactions.

E. Administrative Suite
Restricted to users with admin role.

User Management: Add/Deactivate staff accounts.

Database Management: * Edit/Delete: Manual overrides for ECDC records.

Schema Sync: Reference the schemas.sql or tables.json in the /data folder to ensure data integrity.

4. Technical Constraints & Data Handling
Data Source: All forms must map directly to the provided table schemas.

Pre-Authentication: The agent should assume a users table exists with pre-defined roles (e.g., viewer, editor, admin).

Security: Ensure that "Edit" and "Admin" pages are inaccessible to "Viewer" roles.

5. Development Instructions for the Agent
Agent Goal: Generate the frontend components and API endpoints required to satisfy the above pages. Ensure the UI remains strictly "clean and white." Use the provided table schemas to build the CRUD (Create, Read, Update, Delete) logic for the Outreach and Administrative pages.