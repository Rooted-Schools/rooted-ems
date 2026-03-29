/**
 * School-specific policy text for registration packet acknowledgment items.
 *
 * Sourced from RSV Student & Family Handbook 2025-2026 and adapted for each campus.
 * Keys match campus_id values in the database.
 *
 * To update a policy: edit the text below and redeploy.
 * Future: migrate to packet_requirement.policy_text column for admin-editable policies.
 */

// Campus IDs
const RSV  = "33333333-0000-0000-0000-000000000001"; // Rooted School Vancouver
const RSSC = "33333333-0000-0000-0000-000000000002"; // C.R. Neal Academy (Columbia, SC)
const RSOH = "33333333-0000-0000-0000-000000000003"; // Rooted School Cleveland

export type PolicyMap = Record<string, string>; // item_type → policy text

// ─── RSV — Rooted School Vancouver ─────────────────────────────────────────

const RSV_POLICIES: PolicyMap = {

  tech_policy: `TECHNOLOGY ACCEPTABLE USE POLICY
Rooted School Vancouver

Technology supports our mission to prepare students for high-demand careers while maintaining safety and appropriate use.

PERMITTED ACTIVITIES
• Academic research and coursework completion
• Educational software and approved applications
• Digital portfolio and project development
• Communication with teachers and classmates about schoolwork

PROHIBITED ACTIVITIES
• Social media during instructional time
• Gaming or entertainment content during school hours
• Accessing inappropriate content (violence, pornography, hate speech)
• Cyberbullying, harassment, or threatening communications
• Bypassing school internet filters or security measures
• Unauthorized sharing of personal information

1:1 DEVICE RESPONSIBILITIES
• Charge device nightly and bring fully charged daily
• Keep device in protective case when provided
• Report technical issues immediately to IT support
• Use technology for educational purposes only during school hours

CONSEQUENCES FOR MISUSE
1. Warning: Redirection and policy review
2. Restricted Access: Loss of privileges for remainder of day
3. Parent Conference: Technology use plan development
4. Extended Restriction: Loss of privileges 1–5 days
5. Major Violations: Possible suspension and loss of technology privileges

DATA PRIVACY & SECURITY
• Student data is protected under FERPA requirements
• Family consent is required for tools that collect personal information
• Privacy violations are reported immediately to administration

By signing below, I confirm that my student and I have read, understand, and agree to abide by this Acceptable Use Policy.`,

  handbook_ack: `STUDENT & FAMILY HANDBOOK ACKNOWLEDGMENT
Rooted School Vancouver — 2025–2026

This handbook represents our shared commitment to student success, equity, and preparation for financial freedom. By working together — students, families, and school — we create an environment where every student can thrive.

By signing below, I confirm that:
• I have received and reviewed the Rooted School Vancouver Student & Family Handbook 2025–2026
• My student and I understand the policies, expectations, and procedures outlined in the handbook
• I understand that the handbook is reviewed annually and updates will be communicated

The handbook covers: attendance, academic programs, student-directed learning, project-based learning, behavior expectations, dress code, technology use, health and safety, and family engagement.

For questions about handbook policies, contact the front office at frontoffice@rootedschoolvancouver.org or 360-524-2842.

As a dedicated member of the Rooted School Vancouver community, my student pledges to abide by the Student Code of Conduct:
1. Willing Learner: Open-minded and receptive to new knowledge
2. Regular Attendance: Attending school consistently
3. Safe Learning Environment: Contributing to a safe and supportive community
4. Respectful Communication: Treating all community members with dignity
5. Responsible Technology Use: Using school technology ethically and appropriately`,

  discipline_policy: `BEHAVIOR EXPECTATIONS & DISCIPLINE POLICY
Rooted School Vancouver

BEHAVIOR PHILOSOPHY
We use restorative practices to build community, teach responsibility, and repair harm when expectations are not met. Our goal is keeping students engaged in learning while building life skills.

SCHOOL-WIDE EXPECTATIONS
• Respect: Show consideration for self, others, and property
• Responsibility: Take ownership of actions and learning
• Safety: Maintain physical and emotional safety for all
• Growth: Embrace challenges and learn from mistakes

GRADUATED RESPONSE SYSTEM
Level 1 — Minor (Classroom-managed): Redirection, reflection, brief restorative conversation
Level 2 — Moderate (Classroom + admin): Restorative conference, family contact, behavior plan
Level 3 — Serious (Admin-managed): In-school suspension (1–3 days), restorative process required, family meeting
Level 4 — Severe (Admin + potential law enforcement): Out-of-school suspension (1–10 days), expulsion consideration, law enforcement if required

RESTORATIVE PRACTICES
• Restorative Circles: Used for community building and conflict resolution
• Peer Mediation: Trained student mediators assist in conflict resolution
• Restorative Conferences: Structured conversations to repair harm and restore relationships

By signing below, I confirm that my student and I have read and understand the behavior expectations and discipline policy for Rooted School Vancouver.`,

  media_release: `PHOTO/VIDEO/MEDIA RELEASE CONSENT
Rooted School Vancouver

Rooted School Vancouver may photograph or video-record students during school activities for use in school publications, the school website, social media, newsletters, and promotional materials.

WHAT THIS COVERS
• School events, classroom activities, field trips, and extracurricular activities
• Use in print materials, digital publications, and social media platforms
• Internal school communications and community outreach

WHAT THIS DOES NOT COVER
• Your child's name will not be published alongside photos without separate written consent
• Images will not be sold or shared with third parties for commercial purposes
• Medical or sensitive situations will never be photographed

YOUR OPTIONS
By completing this form, you are indicating your consent preference. You may withdraw consent at any time by contacting the front office.

For questions, contact: frontoffice@rootedschoolvancouver.org or 360-524-2842`,

  field_trip: `BLANKET FIELD TRIP PERMISSION
Rooted School Vancouver — 2025–2026 School Year

This annual permission form authorizes your student to participate in school-sponsored field trips and off-campus learning activities during the 2025–2026 school year.

WHAT IS COVERED
• Educational field trips within the Vancouver/Portland metropolitan area
• Career-connected learning visits (internship sites, college campuses, businesses)
• Community service and project-based learning events
• School-sponsored extracurricular travel

EXPECTATIONS DURING FIELD TRIPS
• Students are expected to follow all school behavior expectations while off campus
• Dress code applies during all field trips and professional visits
• Students may not use personal phones except when permitted by supervising staff
• Students who do not meet behavioral standards may lose field trip privileges

TRANSPORTATION
• School-arranged transportation will be used for field trips
• Families will be notified in advance of transportation arrangements

EMERGENCY CONTACT
School staff will carry student emergency information during all field trips. Please ensure your emergency contact information is current.

NOTE: Overnight trips and out-of-state travel require separate permission forms.

For questions, contact: frontoffice@rootedschoolvancouver.org or 360-524-2842`,

  internet_safety: `INTERNET SAFETY AGREEMENT
Rooted School Vancouver

DIGITAL CITIZENSHIP COMMITMENT
As part of our commitment to preparing students for college and career success, Rooted School Vancouver provides students with access to the internet and digital tools. This agreement outlines expectations for safe, responsible, and ethical online behavior.

STUDENT COMMITMENTS
• Use the internet for educational purposes only during school hours
• Never share personal information (address, phone number, passwords) online
• Report unsafe, inappropriate, or uncomfortable online situations to a trusted adult
• Treat others online with the same respect you would show in person
• Never attempt to bypass school internet filters
• Protect school and personal devices from unauthorized access

SOCIAL MEDIA
• Social media use is not permitted during instructional time
• School devices may not be used to access personal social media accounts
• Students are responsible for their online conduct, including outside of school hours, when it impacts the school community

CYBERBULLYING PREVENTION
• Cyberbullying, harassment, and threatening communications are prohibited
• All online communications should be respectful and constructive
• Report any cyberbullying to a teacher, counselor, or administrator immediately

By signing below, I confirm that my student and I understand and agree to this Internet Safety Agreement.`,

  anti_bullying: `ANTI-BULLYING & HARASSMENT PREVENTION POLICY
Rooted School Vancouver — Harassment, Intimidation, and Bullying (HIB) Policy

Schools are meant to be safe and inclusive environments where all students are protected from Harassment, Intimidation, and Bullying (HIB), including in the classroom, on the school bus, in school sports, and during other school activities.

WHAT IS HIB?
HIB is any intentional electronic, written, verbal, or physical act that:
• Physically harms a student or damages their property
• Has the effect of substantially interfering with a student's education
• Is so severe, persistent, or pervasive that it creates an intimidating or threatening educational environment
• Has the effect of substantially disrupting the orderly operation of school

REPORTING HIB
If you witness or experience HIB, report it to any staff member. Our HIB Compliance Officer is:
Adrienne Lee-Kernell, School Leader
akernell@rootedschoolvancouver.org | 360-524-2842

WHAT HAPPENS AFTER A REPORT?
School staff will investigate and take appropriate action to stop HIB and prevent recurrence. The school must address any effects the behavior had on students, including eliminating hostile environments.

ROOTED'S COMMITMENT
Rooted School Vancouver prohibits any acts of discrimination, harassment, intimidation, or bullying. We are committed to creating a community built on respect, dignity, and belonging for every student.

By signing below, I confirm that my student and I have read and understand Rooted School Vancouver's Anti-Bullying and Harassment Prevention Policy.`,

  uniform_policy: `DRESS CODE POLICY
Rooted School Vancouver

PURPOSE
Our dress code prepares students for professional environments while allowing personal expression and ensuring equitable, consistent enforcement.

DAILY ATTIRE REQUIREMENTS
Tops:
• Collared shirts, crew neck t-shirts, or blouses
• Sleeves required (no tank tops, spaghetti straps, or strapless)
• Necklines must not extend below collarbone
• Midriff must be covered when arms are raised above head
• No undergarments visible

Bottoms:
• Pants, chinos, or knee-length shorts/skirts
• Waistbands must sit at natural waist
• No rips, tears, or distressed denim

Footwear:
• Closed-toe shoes recommended for safety
• No bedroom slippers or unsafe footwear

PROFESSIONAL/INTERNSHIP ATTIRE
For internships and professional experiences:
• Rooted polo, professional button-down, or approved dress shirt
• Dress pants or chinos (no cargo pants, shorts, or jeans)
• Dress shoes, loafers, or professional sneakers

NEVER APPROPRIATE
• Clothing with drug, alcohol, tobacco, or weapon references
• Clothing with offensive, discriminatory, or sexually suggestive content
• Hoods worn inside the building during instructional time

ENFORCEMENT
Dress code is enforced with an equity-centered approach — private conversations only, never public correction. Economic barriers are addressed through school clothing assistance.

By signing below, I confirm that my student and I have read and understand the Rooted School Vancouver Dress Code Policy.`,

  ferpa_consent: `FERPA DIRECTORY INFORMATION CONSENT
Rooted School Vancouver

THE FAMILY EDUCATIONAL RIGHTS AND PRIVACY ACT (FERPA)
FERPA affords parents and students over 18 years of age certain rights with respect to the student's education records. These rights include:
• The right to inspect and review the student's education records
• The right to request amendment of education records the parent believes are inaccurate
• The right to consent to disclosures of personally identifiable information contained in the student's education records

DIRECTORY INFORMATION
Rooted School Vancouver designates the following as Directory Information:
• Student's name
• Dates of attendance
• Grade level
• Participation in school activities and sports
• Honors and awards received

CONSENT OPTIONS
By completing this form, you are indicating your preference regarding the release of your student's directory information for school publications, the school website, and recognition programs.

You may opt out of directory information disclosure at any time by contacting the front office in writing.

For questions about FERPA rights and student records, contact:
frontoffice@rootedschoolvancouver.org | 360-524-2842

For additional information about FERPA: www.ed.gov/ferpa`,
};

// ─── C.R. Neal Academy (Columbia, SC) ──────────────────────────────────────

const RSSC_POLICIES: PolicyMap = {

  tech_policy: `TECHNOLOGY ACCEPTABLE USE POLICY
C.R. Neal Academy — Columbia, SC

Technology supports our mission to prepare students for high-demand careers while maintaining safety and appropriate use.

PERMITTED ACTIVITIES
• Academic research and coursework completion
• Educational software and approved applications
• Digital portfolio and project development
• Communication with teachers and classmates about schoolwork

PROHIBITED ACTIVITIES
• Social media during instructional time
• Gaming or entertainment content during school hours
• Accessing inappropriate content (violence, pornography, hate speech)
• Cyberbullying, harassment, or threatening communications
• Bypassing school internet filters or security measures
• Unauthorized sharing of personal information

1:1 DEVICE RESPONSIBILITIES
• Charge device nightly and bring fully charged daily
• Keep device in protective case when provided
• Report technical issues immediately to IT support
• Use technology for educational purposes only during school hours

CONSEQUENCES FOR MISUSE
1. Warning: Redirection and policy review
2. Restricted Access: Loss of privileges for remainder of day
3. Parent Conference: Technology use plan development
4. Extended Restriction: Loss of privileges 1–5 days
5. Major Violations: Possible suspension and loss of technology privileges

DATA PRIVACY & SECURITY
• Student data is protected under FERPA requirements
• Family consent is required for tools that collect personal information
• Privacy violations are reported immediately to administration

By signing below, I confirm that my student and I have read, understand, and agree to abide by this Acceptable Use Policy.`,

  handbook_ack: `STUDENT & FAMILY HANDBOOK ACKNOWLEDGMENT
C.R. Neal Academy — 2025–2026

This handbook represents our shared commitment to student success, equity, and preparation for financial freedom. By working together — students, families, and school — we create an environment where every student can thrive.

By signing below, I confirm that:
• I have received and reviewed the C.R. Neal Academy Student & Family Handbook 2025–2026
• My student and I understand the policies, expectations, and procedures outlined in the handbook
• I understand that the handbook is reviewed annually and updates will be communicated

The handbook covers: attendance, academic programs, student-directed learning, project-based learning, behavior expectations, dress code, technology use, health and safety, and family engagement.

C.R. Neal Academy is authorized by Voorhees University and operates under the oversight of the South Carolina Public Charter School District (SCPSD).

For questions about handbook policies, contact the school office.

As a dedicated member of the C.R. Neal Academy community, my student pledges to abide by the Student Code of Conduct:
1. Willing Learner: Open-minded and receptive to new knowledge
2. Regular Attendance: Attending school consistently
3. Safe Learning Environment: Contributing to a safe and supportive community
4. Respectful Communication: Treating all community members with dignity
5. Responsible Technology Use: Using school technology ethically and appropriately`,

  discipline_policy: `BEHAVIOR EXPECTATIONS & DISCIPLINE POLICY
C.R. Neal Academy — Columbia, SC

BEHAVIOR PHILOSOPHY
We use restorative practices to build community, teach responsibility, and repair harm when expectations are not met. Our goal is keeping students engaged in learning while building life skills.

SCHOOL-WIDE EXPECTATIONS
• Respect: Show consideration for self, others, and property
• Responsibility: Take ownership of actions and learning
• Safety: Maintain physical and emotional safety for all
• Growth: Embrace challenges and learn from mistakes

GRADUATED RESPONSE SYSTEM
Level 1 — Minor (Classroom-managed): Redirection, reflection, brief restorative conversation
Level 2 — Moderate (Classroom + admin): Restorative conference, family contact, behavior plan
Level 3 — Serious (Admin-managed): In-school suspension (1–3 days), restorative process required, family meeting
Level 4 — Severe (Admin + potential law enforcement): Out-of-school suspension (1–10 days), expulsion consideration, law enforcement if required

South Carolina law requires schools to report certain offenses to law enforcement. C.R. Neal Academy complies with all SCDE reporting requirements.

RESTORATIVE PRACTICES
• Restorative Circles: Used for community building and conflict resolution
• Peer Mediation: Trained student mediators assist in conflict resolution
• Restorative Conferences: Structured conversations to repair harm and restore relationships

By signing below, I confirm that my student and I have read and understand the behavior expectations and discipline policy for C.R. Neal Academy.`,

  media_release: `PHOTO/VIDEO/MEDIA RELEASE CONSENT
C.R. Neal Academy — Columbia, SC

C.R. Neal Academy may photograph or video-record students during school activities for use in school publications, the school website, social media, newsletters, and promotional materials.

WHAT THIS COVERS
• School events, classroom activities, field trips, and extracurricular activities
• Use in print materials, digital publications, and social media platforms
• Internal school communications and community outreach

WHAT THIS DOES NOT COVER
• Your child's name will not be published alongside photos without separate written consent
• Images will not be sold or shared with third parties for commercial purposes
• Medical or sensitive situations will never be photographed

YOUR OPTIONS
By completing this form, you are indicating your consent preference. You may withdraw consent at any time by contacting the school office.`,

  field_trip: `BLANKET FIELD TRIP PERMISSION
C.R. Neal Academy — 2025–2026 School Year

This annual permission form authorizes your student to participate in school-sponsored field trips and off-campus learning activities during the 2025–2026 school year.

WHAT IS COVERED
• Educational field trips within the Columbia, SC metro area and South Carolina
• Career-connected learning visits (internship sites, college campuses, businesses)
• Community service and project-based learning events
• School-sponsored extracurricular travel

EXPECTATIONS DURING FIELD TRIPS
• Students are expected to follow all school behavior expectations while off campus
• Dress code applies during all field trips and professional visits
• Students who do not meet behavioral standards may lose field trip privileges

TRANSPORTATION
• School-arranged transportation will be used for field trips
• Families will be notified in advance of transportation arrangements

NOTE: Overnight trips and out-of-state travel require separate permission forms.

For questions, contact the school office.`,

  internet_safety: `INTERNET SAFETY AGREEMENT
C.R. Neal Academy — Columbia, SC

DIGITAL CITIZENSHIP COMMITMENT
As part of our commitment to preparing students for college and career success, C.R. Neal Academy provides students with access to the internet and digital tools. This agreement outlines expectations for safe, responsible, and ethical online behavior.

STUDENT COMMITMENTS
• Use the internet for educational purposes only during school hours
• Never share personal information (address, phone number, passwords) online
• Report unsafe, inappropriate, or uncomfortable online situations to a trusted adult
• Treat others online with the same respect you would show in person
• Never attempt to bypass school internet filters
• Protect school and personal devices from unauthorized access

SOCIAL MEDIA
• Social media use is not permitted during instructional time
• School devices may not be used to access personal social media accounts

CYBERBULLYING PREVENTION
• Cyberbullying, harassment, and threatening communications are prohibited
• Report any cyberbullying to a teacher, counselor, or administrator immediately

By signing below, I confirm that my student and I understand and agree to this Internet Safety Agreement.`,

  anti_bullying: `ANTI-BULLYING & HARASSMENT PREVENTION POLICY
C.R. Neal Academy — Columbia, SC

C.R. Neal Academy is committed to providing a safe and inclusive learning environment free from harassment, intimidation, and bullying (HIB). This policy applies in the classroom, on school transportation, at school events, and in all digital communications.

WHAT IS BULLYING/HIB?
HIB is any intentional electronic, written, verbal, or physical act that:
• Physically harms a student or damages their property
• Substantially interferes with a student's education
• Creates an intimidating or threatening educational environment
• Substantially disrupts the orderly operation of school

REPORTING
If you witness or experience bullying or harassment, report it to any staff member or school administrator. All reports are taken seriously and investigated promptly.

South Carolina law (S.C. Code § 59-63-120) requires all public schools, including charter schools, to adopt and enforce anti-bullying policies. C.R. Neal Academy fully complies with these requirements.

ROOTED'S COMMITMENT
C.R. Neal Academy prohibits any acts of discrimination, harassment, intimidation, or bullying. We are committed to creating a community built on respect, dignity, and belonging for every student.

By signing below, I confirm that my student and I have read and understand C.R. Neal Academy's Anti-Bullying and Harassment Prevention Policy.`,

  uniform_policy: `DRESS CODE POLICY
C.R. Neal Academy — Columbia, SC

PURPOSE
Our dress code prepares students for professional environments while allowing personal expression and ensuring equitable, consistent enforcement.

DAILY ATTIRE REQUIREMENTS
Tops:
• Collared shirts, crew neck t-shirts, or blouses
• Sleeves required (no tank tops, spaghetti straps, or strapless)
• Necklines must not extend below collarbone
• Midriff must be covered when arms are raised above head
• No undergarments visible

Bottoms:
• Pants, chinos, or knee-length shorts/skirts
• Waistbands must sit at natural waist
• No rips, tears, or distressed denim

Footwear:
• Closed-toe shoes recommended for safety
• No bedroom slippers or unsafe footwear

PROFESSIONAL/INTERNSHIP ATTIRE
For internships and professional experiences:
• Professional button-down or approved dress shirt
• Dress pants or chinos (no cargo pants, shorts, or jeans)
• Dress shoes, loafers, or professional sneakers

NEVER APPROPRIATE
• Clothing with drug, alcohol, tobacco, or weapon references
• Clothing with offensive, discriminatory, or sexually suggestive content

ENFORCEMENT
Dress code is enforced with an equity-centered approach — private conversations only, never public correction. Economic barriers are addressed through school clothing assistance.

By signing below, I confirm that my student and I have read and understand the C.R. Neal Academy Dress Code Policy.`,

  ferpa_consent: `FERPA DIRECTORY INFORMATION CONSENT
C.R. Neal Academy — Columbia, SC

THE FAMILY EDUCATIONAL RIGHTS AND PRIVACY ACT (FERPA)
FERPA affords parents and students over 18 years of age certain rights with respect to the student's education records. These rights include:
• The right to inspect and review the student's education records
• The right to request amendment of education records the parent believes are inaccurate
• The right to consent to disclosures of personally identifiable information contained in the student's education records

DIRECTORY INFORMATION
C.R. Neal Academy designates the following as Directory Information:
• Student's name
• Dates of attendance
• Grade level
• Participation in school activities and sports
• Honors and awards received

CONSENT OPTIONS
By completing this form, you are indicating your preference regarding the release of your student's directory information for school publications, the school website, and recognition programs.

You may opt out of directory information disclosure at any time by contacting the school office in writing.

C.R. Neal Academy is authorized by Voorhees University and operates as a public charter school under South Carolina law. Student records are maintained in compliance with both FERPA and SC state law.

For additional information about FERPA: www.ed.gov/ferpa`,
};

// ─── Rooted School Cleveland (OH) ──────────────────────────────────────────

const RSOH_POLICIES: PolicyMap = {

  tech_policy: `TECHNOLOGY ACCEPTABLE USE POLICY
Rooted School Cleveland — Ohio

Technology supports our mission to prepare students for high-demand careers while maintaining safety and appropriate use.

PERMITTED ACTIVITIES
• Academic research and coursework completion
• Educational software and approved applications
• Digital portfolio and project development
• Communication with teachers and classmates about schoolwork

PROHIBITED ACTIVITIES
• Social media during instructional time
• Gaming or entertainment content during school hours
• Accessing inappropriate content (violence, pornography, hate speech)
• Cyberbullying, harassment, or threatening communications
• Bypassing school internet filters or security measures
• Unauthorized sharing of personal information

1:1 DEVICE RESPONSIBILITIES
• Charge device nightly and bring fully charged daily
• Keep device in protective case when provided
• Report technical issues immediately to IT support
• Use technology for educational purposes only during school hours

CONSEQUENCES FOR MISUSE
1. Warning: Redirection and policy review
2. Restricted Access: Loss of privileges for remainder of day
3. Parent Conference: Technology use plan development
4. Extended Restriction: Loss of privileges 1–5 days
5. Major Violations: Possible suspension and loss of technology privileges

By signing below, I confirm that my student and I have read, understand, and agree to abide by this Acceptable Use Policy.`,

  handbook_ack: `STUDENT & FAMILY HANDBOOK ACKNOWLEDGMENT
Rooted School Cleveland — 2025–2026

This handbook represents our shared commitment to student success, equity, and preparation for financial freedom. By working together — students, families, and school — we create an environment where every student can thrive.

By signing below, I confirm that:
• I have received and reviewed the Rooted School Cleveland Student & Family Handbook 2025–2026
• My student and I understand the policies, expectations, and procedures outlined in the handbook
• I understand that the handbook is reviewed annually and updates will be communicated

Rooted School Cleveland operates as a public charter school under the Ohio Department of Education and Workforce (ODEW).

For questions about handbook policies, contact the school office.

As a dedicated member of the Rooted School Cleveland community, my student pledges to abide by the Student Code of Conduct:
1. Willing Learner: Open-minded and receptive to new knowledge
2. Regular Attendance: Attending school consistently
3. Safe Learning Environment: Contributing to a safe and supportive community
4. Respectful Communication: Treating all community members with dignity
5. Responsible Technology Use: Using school technology ethically and appropriately`,

  discipline_policy: `BEHAVIOR EXPECTATIONS & DISCIPLINE POLICY
Rooted School Cleveland — Ohio

BEHAVIOR PHILOSOPHY
We use restorative practices to build community, teach responsibility, and repair harm when expectations are not met. Our goal is keeping students engaged in learning while building life skills.

SCHOOL-WIDE EXPECTATIONS
• Respect: Show consideration for self, others, and property
• Responsibility: Take ownership of actions and learning
• Safety: Maintain physical and emotional safety for all
• Growth: Embrace challenges and learn from mistakes

GRADUATED RESPONSE SYSTEM
Level 1 — Minor (Classroom-managed): Redirection, reflection, brief restorative conversation
Level 2 — Moderate (Classroom + admin): Restorative conference, family contact, behavior plan
Level 3 — Serious (Admin-managed): In-school suspension (1–3 days), restorative process required, family meeting
Level 4 — Severe (Admin + potential law enforcement): Out-of-school suspension (1–10 days), expulsion consideration

Ohio law requires schools to report certain offenses to law enforcement. Rooted School Cleveland complies with all ODEW reporting requirements.

RESTORATIVE PRACTICES
• Restorative Circles: Used for community building and conflict resolution
• Peer Mediation: Trained student mediators assist in conflict resolution

By signing below, I confirm that my student and I have read and understand the behavior expectations and discipline policy for Rooted School Cleveland.`,

  media_release: `PHOTO/VIDEO/MEDIA RELEASE CONSENT
Rooted School Cleveland — Ohio

Rooted School Cleveland may photograph or video-record students during school activities for use in school publications, the school website, social media, newsletters, and promotional materials.

WHAT THIS COVERS
• School events, classroom activities, field trips, and extracurricular activities
• Use in print materials, digital publications, and social media platforms
• Internal school communications and community outreach

WHAT THIS DOES NOT COVER
• Your child's name will not be published alongside photos without separate written consent
• Images will not be sold or shared with third parties for commercial purposes

YOUR OPTIONS
By completing this form, you are indicating your consent preference. You may withdraw consent at any time by contacting the school office.`,

  field_trip: `BLANKET FIELD TRIP PERMISSION
Rooted School Cleveland — 2025–2026 School Year

This annual permission form authorizes your student to participate in school-sponsored field trips and off-campus learning activities during the 2025–2026 school year.

WHAT IS COVERED
• Educational field trips within the Greater Cleveland area and Ohio
• Career-connected learning visits (internship sites, college campuses, businesses)
• Community service and project-based learning events
• School-sponsored extracurricular travel

EXPECTATIONS DURING FIELD TRIPS
• Students are expected to follow all school behavior expectations while off campus
• Dress code applies during all field trips and professional visits
• Students who do not meet behavioral standards may lose field trip privileges

NOTE: Overnight trips and out-of-state travel require separate permission forms.

For questions, contact the school office.`,

  internet_safety: `INTERNET SAFETY AGREEMENT
Rooted School Cleveland — Ohio

DIGITAL CITIZENSHIP COMMITMENT
Rooted School Cleveland provides students with access to the internet and digital tools. This agreement outlines expectations for safe, responsible, and ethical online behavior.

STUDENT COMMITMENTS
• Use the internet for educational purposes only during school hours
• Never share personal information (address, phone number, passwords) online
• Report unsafe or inappropriate online situations to a trusted adult immediately
• Treat others online with the same respect you would show in person
• Never attempt to bypass school internet filters

CYBERBULLYING PREVENTION
• Cyberbullying, harassment, and threatening communications are prohibited
• Ohio law (O.R.C. § 3313.666) requires schools to adopt anti-harassment and cyberbullying policies
• Report any cyberbullying to a teacher, counselor, or administrator immediately

By signing below, I confirm that my student and I understand and agree to this Internet Safety Agreement.`,

  anti_bullying: `ANTI-BULLYING & HARASSMENT PREVENTION POLICY
Rooted School Cleveland — Ohio

Rooted School Cleveland is committed to providing a safe and inclusive learning environment free from harassment, intimidation, and bullying. This policy applies in the classroom, on school transportation, at school events, and in all digital communications.

WHAT IS BULLYING?
Bullying is repeated, aggressive behavior intended to hurt another person physically, emotionally, or socially. It includes:
• Physical acts (hitting, pushing, damaging property)
• Verbal acts (name-calling, threats, teasing)
• Social/relational bullying (exclusion, rumors)
• Cyberbullying (online harassment, threatening messages)

REPORTING
If you witness or experience bullying or harassment, report it to any staff member or school administrator. Ohio law (O.R.C. § 3313.666) requires all public schools, including community schools (charter schools), to adopt and enforce anti-harassment and anti-bullying policies.

ROOTED'S COMMITMENT
Rooted School Cleveland prohibits any acts of discrimination, harassment, intimidation, or bullying. We are committed to a community built on respect, dignity, and belonging.

By signing below, I confirm that my student and I have read and understand Rooted School Cleveland's Anti-Bullying and Harassment Prevention Policy.`,

  uniform_policy: `DRESS CODE POLICY
Rooted School Cleveland — Ohio

PURPOSE
Our dress code prepares students for professional environments while allowing personal expression and ensuring equitable, consistent enforcement.

DAILY ATTIRE REQUIREMENTS
Tops:
• Collared shirts, crew neck t-shirts, or blouses
• Sleeves required (no tank tops, spaghetti straps, or strapless)
• Necklines must not extend below collarbone
• Midriff must be covered when arms are raised above head
• No undergarments visible

Bottoms:
• Pants, chinos, or knee-length shorts/skirts
• Waistbands must sit at natural waist
• No rips, tears, or distressed denim

Footwear:
• Closed-toe shoes recommended for safety
• No bedroom slippers or unsafe footwear

NEVER APPROPRIATE
• Clothing with drug, alcohol, tobacco, or weapon references
• Clothing with offensive, discriminatory, or sexually suggestive content

ENFORCEMENT
Dress code is enforced with an equity-centered approach — private conversations only, never public correction.

By signing below, I confirm that my student and I have read and understand the Rooted School Cleveland Dress Code Policy.`,

  ferpa_consent: `FERPA DIRECTORY INFORMATION CONSENT
Rooted School Cleveland — Ohio

THE FAMILY EDUCATIONAL RIGHTS AND PRIVACY ACT (FERPA)
FERPA affords parents and students over 18 years of age certain rights with respect to the student's education records. These rights include:
• The right to inspect and review the student's education records
• The right to request amendment of education records the parent believes are inaccurate
• The right to consent to disclosures of personally identifiable information

DIRECTORY INFORMATION
Rooted School Cleveland designates the following as Directory Information:
• Student's name
• Dates of attendance
• Grade level
• Participation in school activities and sports
• Honors and awards received

CONSENT OPTIONS
By completing this form, you are indicating your preference regarding the release of your student's directory information.

You may opt out at any time by contacting the school office in writing.

Rooted School Cleveland operates as a community school under the Ohio Department of Education and Workforce (ODEW). Student records are maintained in compliance with both FERPA and Ohio state law.

For additional information about FERPA: www.ed.gov/ferpa`,
};

// ─── Export ─────────────────────────────────────────────────────────────────

/**
 * Get policy text for a specific campus and item type.
 * Returns undefined if no school-specific text is configured (falls back to generic description).
 */
export function getPolicyText(campusId: string, itemType: string): string | undefined {
  const map: Record<string, PolicyMap> = {
    [RSV]: RSV_POLICIES,
    [RSSC]: RSSC_POLICIES,
    [RSOH]: RSOH_POLICIES,
  };
  return map[campusId]?.[itemType];
}
