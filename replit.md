# TaxAssist - Form 16 Tax Processing Application

## Overview

TaxAssist is a comprehensive tax processing web application that helps users upload and process their Form 16 documents, calculate tax liabilities, compare tax regimes (old vs new), and provide personalized tax optimization recommendations. The application features secure document upload, automated PDF data extraction, and detailed financial analysis with year-over-year comparisons.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript using Vite as the build tool
- **UI Framework**: shadcn/ui components built on Radix UI primitives
- **Styling**: Tailwind CSS with custom design tokens and CSS variables for theming
- **State Management**: TanStack Query (React Query) for server state management
- **Routing**: Wouter for lightweight client-side routing
- **File Uploads**: Uppy.js with dashboard modal for file management and AWS S3 integration

### Backend Architecture
- **Runtime**: Node.js with Express.js server
- **Language**: TypeScript with ESM modules
- **Authentication**: Replit Auth with OpenID Connect (OIDC) integration
- **Session Management**: Express sessions with PostgreSQL store
- **API Design**: RESTful endpoints with proper error handling and logging middleware

### Data Storage Solutions
- **Primary Database**: PostgreSQL using Neon serverless database
- **ORM**: Drizzle ORM with type-safe schema definitions
- **Object Storage**: Google Cloud Storage for secure PDF document storage
- **Session Storage**: PostgreSQL-backed session store for user authentication

### Database Schema Design
- **Users**: Core user profiles with PAN integration
- **Tax Documents**: Form 16 uploads with processing status tracking
- **Income Sources**: Additional income tracking beyond salary
- **Investments**: Tax-saving investment records (80C, 80D, etc.)
- **Tax Calculations**: Historical calculation results with regime comparisons
- **Tax Suggestions**: AI-driven optimization recommendations

### Authentication and Authorization
- **Authentication Provider**: Replit Auth with OIDC flow
- **Session Management**: Secure HTTP-only cookies with PostgreSQL persistence
- **User Context**: JWT-based user claims with sub-based user identification
- **Route Protection**: Middleware-based authentication guards for API endpoints

### File Processing Pipeline
- **PDF Upload**: Secure upload to Google Cloud Storage with ACL policies
- **Data Extraction**: PDF parsing using pdf-parse library to extract Form 16 data
- **Tax Calculation**: Multi-regime tax computation service with current tax slabs
- **Status Tracking**: Asynchronous processing with status updates (processing/completed/failed)

### Tax Calculation Engine
- **Regime Support**: Both old and new tax regime calculations for AY 2024-25
- **Deduction Processing**: Support for all major tax deductions (80C, 80D, HRA, etc.)
- **Comparison Logic**: Side-by-side regime analysis with savings recommendations
- **Historical Tracking**: Year-over-year trend analysis with growth metrics

### Object Access Control
- **ACL System**: Custom object-level access control for document security
- **Permission Types**: Read/write permissions with group-based access
- **Security Groups**: Flexible group membership system for document sharing
- **Metadata Storage**: ACL policies stored as object metadata in cloud storage

## External Dependencies

### Cloud Services
- **Google Cloud Storage**: Document storage with enterprise security features
- **Neon Database**: Serverless PostgreSQL for application data
- **Replit Infrastructure**: Authentication, hosting, and development environment

### Authentication Services
- **Replit Auth**: OIDC-compliant authentication with session management
- **OpenID Connect**: Industry-standard authentication protocol implementation

### File Processing Libraries
- **pdf-parse**: PDF text extraction and parsing capabilities
- **Uppy.js**: Modern file upload with progress tracking and AWS S3 integration

### UI and Styling Dependencies
- **Radix UI**: Accessible component primitives for complex UI elements
- **Tailwind CSS**: Utility-first CSS framework with custom design system
- **Lucide React**: Icon library with consistent visual design

### Development and Build Tools
- **Vite**: Fast development server and optimized production builds
- **Replit Plugins**: Development tooling including error overlays and debugging features
- **TypeScript**: Type safety across frontend and backend codebases

### Database and ORM
- **Drizzle ORM**: Type-safe database operations with schema migrations
- **Drizzle Kit**: Database migration and schema management tools