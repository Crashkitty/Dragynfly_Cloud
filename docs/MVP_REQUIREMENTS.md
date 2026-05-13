# Dragonfly Cloud MVP Requirements

> **What's shipping in V1** is the short-form contract in
> [`MVP_SCOPE.md`](MVP_SCOPE.md). When this longer document disagrees
> with that one, treat `MVP_SCOPE.md` as the source of truth for
> what's in the pilot today. This file is the broader product
> vision; it includes V1.5+ ambitions (CGM ingestion, BASTION /
> BAST AI, AI summaries, HealthKit / Health Connect) that V1 does
> not ship.

Last updated: 2026-05-08

## 1. Executive Summary

Dragonfly Cloud is a secure, cross-platform clinical research ecosystem for
the Diabetes Taiyi Intervention Pilot Study. The MVP combines a patient-facing
mobile experience, a provider/research dashboard, AI-assisted summaries,
telemedicine workflow support, nutrition and biometric tracking, and
centralized data integration with the BASTION platform.

The current repo implements the early patient-app scaffold and design system.
This document formalizes the MVP scope so product, engineering, clinical, and
research stakeholders are working from the same specification.

Target implementation direction is MERN:

- MongoDB for application and research-facing operational data
- Express/Node.js for APIs and workflow services
- React for patient and provider interfaces
- Cloudflare security and ingress controls, with `cloudflared` used for
  Cloudflare Tunnel where origins are self-hosted or privately hosted

## 2. Goal

Build a scalable digital health platform for diabetes-focused Taiyi
intervention studies that combines patient-facing mobile applications,
provider/research dashboards, AI-assisted clinical workflows, telemedicine,
nutritional analysis, biometric monitoring, and secure API-driven data
integration.

## 3. Stakeholders

- Patients participating in Taiyi diabetes intervention studies
- Providers monitoring patient progress and conducting follow-up care
- Principal investigators overseeing study workflows and outcomes
- Clinical coordinators handling enrollment, consent, and protocol adherence
- Administrators managing roles, access, and study configuration
- Research and public-health teams consuming structured study data

## 4. MVP Scope

The MVP covers Version 1 workflows for:

- Patient onboarding and identity activation
- Blood glucose tracking and daily check-ins
- Food diary capture with meal photos and nutritional notes
- Telemedicine request and consultation workflows
- Taiyi intervention guidance and adherence support
- Provider/research review of participant status and AI-assisted summaries
- Secure file handling and association to participant records
- Structured data exchange with the BASTION platform

## 5. Wireframe-Aligned Product Surfaces

The wireframe deck in [Taiyi Diabetes 2 ui_wireframes.pptx](/home/dream/Documents/dragonflycloud/Taiyi%20Diabetes%202%20ui_wireframes.pptx)
defines five primary MVP surfaces:

1. Login screen
2. Patient dashboard
3. Food diary
4. Telemedicine screen
5. Provider dashboard

These surfaces should remain the UI backbone for the MVP unless the study team
explicitly approves a scope change.

## 6. System Architecture Overview

### 6.1 Logical Components

- Patient app
  Mobile-first React application for participants. MVP delivery target is an
  installable app-like experience through a responsive PWA, with optional
  Capacitor packaging later if native deployment becomes necessary.
- Provider/research dashboard
  Browser-based React desktop experience for providers, principal
  investigators, and research staff.
- API gateway
  Secure entry point for app traffic, third-party integrations, AI services,
  and BASTION connectivity.
- Clinical application services
  Node.js and Express services for authentication, participant management,
  glucose logging, nutrition capture, telemedicine coordination, task
  orchestration, and document handling.
- AI analytics layer
  Summary generation, anomaly detection, trend analysis, and nutritional
  interpretation support.
- BASTION data platform
  System of record for structured research and operational data integration.
- Secure object storage
  Storage for meal photos, glucose-meter photo evidence, consent documents, and
  other study artifacts.

### 6.2 Security Boundary

The production boundary must include:

- Encryption in transit for all application and integration traffic
- Encryption at rest for structured data and uploaded files
- Role-based access control across patient, provider, coordinator, PI, and
  admin roles
- Audit logging for access, data changes, uploads, and AI-generated outputs
- Segregation of patient-facing and staff-facing access paths
- Documented PHI handling, retention, and deletion policies

Important: the current codebase is an MVP scaffold and must not be represented
as HIPAA-compliant until vendor BAAs, security controls, logging, incident
response, and operational processes are finalized.

## 7. Functional Requirements

### 7.1 Authentication and Enrollment

- `FR-001`
  The system shall support patient activation using a study-issued identifier
  and demographic confirmation.
- `FR-002`
  The system shall support biometric re-authentication on supported mobile
  devices.
- `FR-003`
  The system shall support role-based authentication for provider, research,
  coordinator, and administrator users.
- `FR-004`
  The system shall store consent and enrollment state per participant record.

### 7.2 Patient Profile and Medical History

- `FR-010`
  The system shall store patient demographic information relevant to the study.
- `FR-011`
  The system shall capture diabetes-focused medical history, medications, and
  intervention eligibility details.
- `FR-012`
  The system shall display core participant profile information to authorized
  staff.

### 7.3 Blood Glucose Tracking

- `FR-020`
  The system shall support blood glucose data collection from both continuous
  glucose monitoring devices and manually entered finger-stick or lancet
  readings.
- `FR-021`
  Each glucose reading shall include patient ID, timestamp, glucose value,
  reading source, device name, reading context, and calculated status band.
- `FR-022`
  Supported reading contexts shall include:
  `pre_taiyi`, `post_taiyi`, `before_lunch`, `post_lunch_1_to_2h`,
  `post_lunch_3_to_4h`, and `end_of_day`.
- `FR-023`
  Manual and lancet entries shall support optional notes and optional photo
  evidence of the meter display.
- `FR-024`
  The patient dashboard shall display recent glucose trends and the latest
  reading state.
- `FR-025`
  The provider dashboard shall display patient glucose trends and surface
  abnormal patterns for review.
- `FR-026`
  CGM-import capability shall support Libre-style arm-sensor workflows when
  vendor access and integration constraints are resolved.

### 7.4 Food Diary and Nutrition

- `FR-030`
  The system shall allow patients to capture meal photos, descriptions, and
  optional carbohydrate information.
- `FR-031`
  The system shall maintain a recent meal history list for the participant.
- `FR-032`
  The system shall support future AI-assisted meal and menu analysis for macro
  and micro nutrient interpretation.
- `FR-033`
  Authorized providers and researchers shall be able to review meal data in
  participant context.

### 7.5 Telemedicine

- `FR-040`
  The system shall support patient-initiated requests for clinical contact.
- `FR-041`
  The system shall support scheduling and status tracking of telemedicine
  sessions.
- `FR-042`
  The system shall support chat and video consultation workflows in later
  phases once infrastructure and HIPAA-eligible vendors are approved.

### 7.6 Taiyi Intervention and Activity Tracking

- `FR-050`
  The system shall provide Taiyi routine guidance and instructional content.
- `FR-051`
  The system shall track activity and intervention adherence events.
- `FR-052`
  The system shall allow providers and research staff to review adherence
  trends and intervention completion status.

### 7.7 Provider and Research Dashboard

- `FR-060`
  The provider dashboard shall include a patient list, participant overview,
  charts, AI-assisted summary, and workflow/task area.
- `FR-061`
  Authorized staff shall be able to associate uploaded files and notes with a
  participant record.
- `FR-062`
  The system shall support provider and PI workflow management actions such as
  follow-up review, intervention tasks, and unresolved item tracking.

### 7.8 AI-Assisted Features

- `FR-070`
  The system shall generate AI-assisted daily or episodic summaries of patient
  inputs for staff review.
- `FR-071`
  The AI layer shall support trend analysis across glucose, activity, meals,
  and intervention adherence.
- `FR-072`
  The AI layer shall support future risk detection and anomaly flagging for
  provider review.
- `FR-073`
  All AI-generated outputs shall be attributable, reviewable, and clearly
  presented as assistive rather than autonomous clinical decisions.

## 8. Non-Functional Requirements

- `NFR-001`
  All traffic shall use TLS in production.
- `NFR-002`
  PHI-bearing data stores and file stores shall use encryption at rest.
- `NFR-003`
  The provider and research surfaces shall support audit trails for access,
  edits, uploads, exports, and AI outputs.
- `NFR-004`
  The patient mobile UI shall prioritize large tap targets, high contrast, and
  readability for elderly participants.
- `NFR-005`
  The system shall support API-based integration patterns rather than direct
  point-to-point coupling where practical.
- `NFR-006`
  The system shall define environment separation for development, staging, and
  production.
- `NFR-007`
  The system shall provide reliable backup and recovery procedures for
  structured data and uploaded artifacts.

## 9. Security Requirements

- `SEC-001`
  Enforce RBAC across patient, provider, coordinator, PI, and admin roles.
- `SEC-002`
  Protect sessions with secure token handling, expiration, and revocation.
- `SEC-003`
  Log authentication events, privileged actions, data export actions, and
  document access.
- `SEC-004`
  Use signed upload or download URLs for object-storage access where feasible.
- `SEC-005`
  Limit staff access through policy-controlled entry points such as SSO,
  network policy, and zero-trust access controls.
- `SEC-006`
  Preserve immutable or tamper-evident audit records for regulated workflows.

## 10. API and Integration Requirements

- `API-001`
  The platform shall expose secure API endpoints for participant, glucose,
  meals, telemedicine events, files, summaries, and study workflow records.
- `API-002`
  OAuth2 and OpenID Connect should be the preferred authentication model for
  staff-facing APIs.
- `API-003`
  The platform should remain compatible with healthcare integration patterns
  such as FHIR where appropriate.
- `API-004`
  The system shall support integration with BASTION for structured storage,
  organization, and analytics.
- `API-005`
  The platform shall support future wearable, CGM, lab, and telemedicine
  vendor integrations without requiring a patient-app rewrite.

## 11. Data Model Summary

```text
Patient
  id
  studyEnrollmentId
  demographics
  diabetesHistory
  consentStatus
  enrolledAt

GlucoseReading
  patientId
  valueMgDl
  source: cgm | manual | lancet
  deviceName
  context: pre_taiyi | post_taiyi | before_lunch |
           post_lunch_1_to_2h | post_lunch_3_to_4h | end_of_day
  timestamp
  status
  notes
  photoUrl

MealEntry
  patientId
  imageUrl
  description
  carbsGrams
  capturedAt

TelemedicineSession
  patientId
  requestedAt
  scheduledAt
  status
  channel
  notes

ProviderNote
  patientId
  authorId
  body
  createdAt

ConsentDocument
  patientId
  version
  signedAt
  fileUrl
```

## 12. Recommended MVP Deployment

### 12.1 Frontend

- Patient app:
  mobile-first React PWA
- Provider dashboard:
  React web application for desktop and tablet use

### 12.2 Infrastructure

- Frontend hosting:
  React build artifacts can be served through Cloudflare Pages or a controlled
  origin routed through Cloudflare.
- Application runtime:
  Node.js and Express services deployed on a VM, container host, or managed
  platform.
- Database:
  MongoDB with documented security controls, encryption, backup, and BAA
  availability as required by the operating model.
- Edge/API gateway:
  Cloudflare can provide WAF, TLS termination, DNS, rate limiting, and Access
  controls in front of the application services.
- Application API:
  Express-based REST APIs with room for future FHIR-compatible or integration
  adapters.
- File storage:
  Cloudflare R2 with signed uploads/downloads.
- Staff access:
  Cloudflare Access or equivalent zero-trust access controls for provider and
  admin surfaces.
- Tunnel and private ingress:
  `cloudflared` should be treated as the secure tunnel/ingress layer for
  privately hosted MERN services. It does not replace the underlying hosting
  runtime; it exposes and protects it.

### 12.3 Compliance Caveat

Cloudflare can be part of a strong MVP architecture, but the system must not
be marketed as HIPAA-compliant until all vendors, BAAs, operational controls,
and PHI-handling procedures are verified.

## 13. Delivery Phases

### Phase 1

- Patient app scaffold
- Manual and lancet glucose entry
- Food diary capture
- Telemedicine request workflow
- Provider dashboard prototype
- BASTION-backed data model definition

### Phase 1.5

- Libre or device-mediated CGM import
- Chinese localization
- Expanded study workflow automation

### Phase 2

- Full video telemedicine
- Deeper AI analytics and risk detection
- Wearables and health-platform sync
- Native mobile packaging and app-store distribution as needed

## 14. Current Repository Alignment

Current repo status:

- Flutter patient app prototype exists
- Login, dashboard, food diary, telemedicine placeholder, and profile screens
  exist
- Provider web app is still a placeholder
- Manual glucose logging is being added in-app
- Final implementation direction is MERN rather than Flutter
- Real CGM integration, real telemedicine, production auth, and production
  HIPAA controls remain deferred
