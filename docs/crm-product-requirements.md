# CRM Product Requirements

This repository is a customized fork of Twenty CRM.

## Calendar / Meetings

The calendar should eventually support:

- Day, week, month, and agenda views
- Create, edit, view, and delete meetings
- Meeting title, description, location, start date/time, and end date/time
- Meeting owner and participants
- Links to people, companies, prospects, and opportunities
- Meeting notes and activity history
- Search, filters, and sorting
- Recurring meetings
- Reminders and notifications
- Time zones
- Permissions
- Responsive web interface
- Future Google Calendar or Outlook synchronization

## Prospects

The prospect module should eventually support:

- Prospect list and detail pages
- Create, edit, view, and delete prospects
- Name, company, email, phone, job title, address, and website
- Owner, source, sector, status, tags, and notes
- List view and Kanban/card view
- Search, filters, sorting, and pagination
- Import and export
- Bulk actions
- Activity history
- Calls, emails, meetings, notes, tasks, and opportunities
- Conversion into person, company, and opportunity
- Duplicate detection
- Custom fields
- Permissions
- Responsive interface

## Development principle

Implement the requirements in small phases.

Do not implement the complete backlog in one task.

First inspect the existing Twenty architecture and reuse existing entities, components, services, GraphQL operations, permissions, and database patterns.
