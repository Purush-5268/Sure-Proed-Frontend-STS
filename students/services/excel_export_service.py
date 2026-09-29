import io
from datetime import datetime
from django.http import HttpResponse
from django.utils import timezone
import openpyxl
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter


def generate_student_github_repos_excel(queryset=None) -> HttpResponse:
    """
    Generates a beautifully styled, high-performance Excel report of all student
    GitHub repositories, cohort assignments, and connection statuses.
    """
    from students.models import StudentProfile

    if queryset is None:
        queryset = StudentProfile.objects.all()

    # Optimized single-query prefetch
    profiles = (
        queryset.select_related("user")
        .prefetch_related("applications__assigned_cohort", "applications__course")
        .order_by("student_code")
    )

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Student Repositories"
    ws.views.sheetView[0].showGridLines = True

    # Palette
    header_fill = PatternFill(start_color="1E40AF", end_color="1E40AF", fill_type="solid")
    header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
    title_font = Font(name="Calibri", size=15, bold=True, color="1E293B")
    meta_font = Font(name="Calibri", size=10, italic=True, color="64748B")
    regular_font = Font(name="Calibri", size=10, color="0F172A")
    link_font = Font(name="Calibri", size=10, color="0284C7", underline="single")

    thin_border = Border(
        left=Side(style="thin", color="CBD5E1"),
        right=Side(style="thin", color="CBD5E1"),
        top=Side(style="thin", color="CBD5E1"),
        bottom=Side(style="thin", color="CBD5E1"),
    )

    fill_configured = PatternFill(start_color="DCFCE7", end_color="DCFCE7", fill_type="solid")  # soft green
    font_configured = Font(name="Calibri", size=10, bold=True, color="166534")

    fill_missing = PatternFill(start_color="FEF9C3", end_color="FEF9C3", fill_type="solid")     # soft yellow
    font_missing = Font(name="Calibri", size=10, bold=True, color="854D0E")

    fill_no_github = PatternFill(start_color="F1F5F9", end_color="F1F5F9", fill_type="solid")   # soft gray
    font_no_github = Font(name="Calibri", size=10, italic=True, color="64748B")

    # Title Block
    ws.merge_cells("A1:L1")
    ws["A1"] = "SURE Trust — Student GitHub Repositories Report"
    ws["A1"].font = title_font
    ws["A1"].alignment = Alignment(vertical="center")

    now_str = timezone.now().strftime("%Y-%m-%d %H:%M:%S UTC")
    ws.merge_cells("A2:L2")
    ws["A2"] = f"Generated on: {now_str}"
    ws["A2"].font = meta_font
    ws["A2"].alignment = Alignment(vertical="center")

    headers = [
        "#",
        "Student Code",
        "Student Name",
        "Email Address",
        "Current Course",
        "Current Cohort",
        "Training Batch / LST",
        "Application Status",
        "GitHub Connected",
        "GitHub Username",
        "Repository URL",
        "Repository Status",
    ]

    header_row_idx = 4
    for col_idx, header in enumerate(headers, 1):
        cell = ws.cell(row=header_row_idx, column=col_idx, value=header)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        cell.border = thin_border
    ws.row_dimensions[header_row_idx].height = 24

    configured_count = 0
    missing_count = 0
    no_github_count = 0

    current_row = 5
    for idx, profile in enumerate(profiles, 1):
        user = profile.user
        name = f"{user.first_name} {user.last_name}".strip() if user else ""
        email = user.email if user else ""

        # Retrieve latest active application
        latest_app = None
        for app in profile.applications.all():
            if latest_app is None or (app.applied_at and latest_app.applied_at and app.applied_at > latest_app.applied_at):
                latest_app = app

        course_name = latest_app.course.name if (latest_app and latest_app.course) else "-"
        cohort_name = latest_app.assigned_cohort.code if (latest_app and latest_app.assigned_cohort) else "-"
        lst_batch = latest_app.assigned_cohort.lst_batch if (latest_app and latest_app.assigned_cohort and latest_app.assigned_cohort.lst_batch) else "-"
        app_status = latest_app.status if latest_app else "-"

        gh_connected = "YES" if profile.is_github_connected else "NO"
        gh_username = profile.github_username or "-"
        repo_url = profile.github_repo_url or ""

        if repo_url:
            repo_status = "CONFIGURED"
            configured_count += 1
        elif profile.is_github_connected or profile.github_username:
            repo_status = "MISSING REPO"
            missing_count += 1
        else:
            repo_status = "NOT CONNECTED"
            no_github_count += 1

        row_data = [
            idx,
            profile.student_code or "-",
            name or "-",
            email or "-",
            course_name,
            cohort_name,
            lst_batch,
            app_status,
            gh_connected,
            gh_username,
            repo_url if repo_url else "Not configured",
            repo_status,
        ]

        for col_idx, val in enumerate(row_data, 1):
            cell = ws.cell(row=current_row, column=col_idx, value=val)
            cell.font = regular_font
            cell.border = thin_border
            cell.alignment = Alignment(vertical="center")

            # Column specific styling
            if col_idx == 1:
                cell.alignment = Alignment(horizontal="center", vertical="center")
            elif col_idx in [2, 6, 7, 8, 9, 10]:
                cell.alignment = Alignment(horizontal="center", vertical="center")
            elif col_idx == 11 and repo_url:
                cell.font = link_font
                cell.hyperlink = repo_url
            elif col_idx == 12:
                cell.alignment = Alignment(horizontal="center", vertical="center")
                if repo_status == "CONFIGURED":
                    cell.fill = fill_configured
                    cell.font = font_configured
                elif repo_status == "MISSING REPO":
                    cell.fill = fill_missing
                    cell.font = font_missing
                else:
                    cell.fill = fill_no_github
                    cell.font = font_no_github

        ws.row_dimensions[current_row].height = 20
        current_row += 1

    # Meta summary block in row 3
    summary_text = (
        f"Total Students: {len(profiles)}  |  "
        f"Configured Repositories: {configured_count}  |  "
        f"Pending Setup: {missing_count}  |  "
        f"No GitHub Linked: {no_github_count}"
    )
    ws.merge_cells("A3:L3")
    ws["A3"] = summary_text
    ws["A3"].font = Font(name="Calibri", size=10, bold=True, color="1E40AF")
    ws["A3"].alignment = Alignment(vertical="center")

    # Auto-adjust column widths
    for col in ws.columns:
        max_len = 0
        col_letter = get_column_letter(col[0].column)
        for cell in col:
            # Skip title & summary rows from width calculation
            if cell.row in [1, 2, 3]:
                continue
            val_str = str(cell.value or "")
            if len(val_str) > max_len:
                max_len = len(val_str)
        ws.column_dimensions[col_letter].width = max(max_len + 4, 12)

    # Freeze panes below header
    ws.freeze_panes = "A5"

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)

    filename = f"suretrust_student_repositories_{timezone.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    response = HttpResponse(
        output.getvalue(),
        content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response
