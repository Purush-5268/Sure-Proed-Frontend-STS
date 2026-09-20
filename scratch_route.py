import re

with open("src/routes/AppRoutes.jsx", "r") as f:
    code = f.read()

# Add import
if "VolunteerContributions" not in code:
    code = code.replace(
        'const VolunteerCohorts = lazy(() => import("../pages/trustee/volunteer/Cohorts"));',
        'const VolunteerCohorts = lazy(() => import("../pages/trustee/volunteer/Cohorts"));\nconst VolunteerContributions = lazy(() => import("../pages/trustee/volunteer/ContributionTab"));'
    )
    
    # Add route
    code = code.replace(
        '<Route path="volunteer/cohorts" element={<VolunteerCohorts />} />',
        '<Route path="volunteer/cohorts" element={<VolunteerCohorts />} />\n              <Route path="volunteer/contributions" element={<VolunteerContributions />} />'
    )
    
    with open("src/routes/AppRoutes.jsx", "w") as f:
        f.write(code)
    print("Updated AppRoutes.jsx")
else:
    print("Already updated AppRoutes.jsx")
