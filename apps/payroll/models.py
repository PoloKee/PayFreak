
import uuid
from django.db import models

class Company(models.Model):
    company_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    address = models.TextField(blank=True, null=True)
    phone = models.CharField(max_length=20, blank=True, null=True)
    logo = models.CharField(max_length=500, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name

class Employee(models.Model):
    EMPLOYEE_TYPE_CHOICES = [
        ('hourly', 'Hourly'),
        ('salaried', 'Salaried'),
        ('contractor', 'Contractor'),
    ]
    PAY_FREQUENCY_CHOICES = [
        ('weekly', 'Weekly'),
        ('bi-weekly', 'Bi-Weekly'),
        ('semi-monthly', 'Semi-Monthly'),
        ('monthly', 'Monthly'),
    ]

    employee_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey(Company, on_delete=models.CASCADE)
    employee_number = models.CharField(max_length=50, unique=True)
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    middle_initial = models.CharField(max_length=1, blank=True, null=True)
    email = models.EmailField(unique=True)
    phone = models.CharField(max_length=20, blank=True, null=True)
    address_line1 = models.CharField(max_length=255, blank=True, null=True)
    address_line2 = models.CharField(max_length=255, blank=True, null=True)
    city = models.CharField(max_length=100, blank=True, null=True)
    state = models.CharField(max_length=2, blank=True, null=True)
    zip_code = models.CharField(max_length=20, blank=True, null=True)
    ssn_encrypted = models.CharField(max_length=255, blank=True, null=True)  # We will handle encryption at the application level
    hire_date = models.DateField()
    termination_date = models.DateField(blank=True, null=True)
    employee_type = models.CharField(max_length=20, choices=EMPLOYEE_TYPE_CHOICES)
    pay_frequency = models.CharField(max_length=20, choices=PAY_FREQUENCY_CHOICES)
    hourly_rate = models.DecimalField(max_digits=10, decimal_places=2, blank=True, null=True)
    annual_salary = models.DecimalField(max_digits=10, decimal_places=2, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f'{self.first_name} {self.last_name}'

class BankAccount(models.Model):
    ACCOUNT_TYPE_CHOICES = [
        ('checking', 'Checking'),
        ('savings', 'Savings'),
        ('payroll_card', 'Payroll Card'),
    ]

    account_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE)
    account_type = models.CharField(max_length=20, choices=ACCOUNT_TYPE_CHOICES)
    routing_number = models.CharField(max_length=9)
    account_number_encrypted = models.CharField(max_length=255)
    is_primary = models.BooleanField(default=False)
    deposit_percentage = models.DecimalField(max_digits=5, decimal_places=2, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f'{self.employee} - {self.get_account_type_display()}'

class PayrollRun(models.Model):
    RUN_TYPE_CHOICES = [
        ('regular', 'Regular'),
        ('bonus', 'Bonus'),
        ('off-cycle', 'Off-Cycle'),
        ('correction', 'Correction'),
    ]
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('processing', 'Processing'),
        ('completed', 'Completed'),
        ('failed', 'Failed'),
    ]

    payroll_run_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    run_date = models.DateField()
    pay_period_start = models.DateField()
    pay_period_end = models.DateField()
    payment_date = models.DateField()
    run_type = models.CharField(max_length=20, choices=RUN_TYPE_CHOICES)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    processed_by = models.ForeignKey(Employee, on_delete=models.SET_NULL, null=True, blank=True)
    total_gross_pay = models.DecimalField(max_digits=15, decimal_places=2, blank=True, null=True)
    total_net_pay = models.DecimalField(max_digits=15, decimal_places=2, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'Payroll Run - {self.run_date}'

class Paystub(models.Model):
    PAYMENT_METHOD_CHOICES = [
        ('direct_deposit', 'Direct Deposit'),
        ('paper_check', 'Paper Check'),
        ('payroll_card', 'Payroll Card'),
    ]

    paystub_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE)
    payroll_run = models.ForeignKey(PayrollRun, on_delete=models.CASCADE, null=True, blank=True)
    pay_period_start = models.DateField()
    pay_period_end = models.DateField()
    payment_date = models.DateField()
    check_number = models.CharField(max_length=50, blank=True, null=True)
    payment_method = models.CharField(max_length=20, choices=PAYMENT_METHOD_CHOICES)
    gross_pay = models.DecimalField(max_digits=12, decimal_places=2)
    total_pre_tax_deductions = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_taxes = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_post_tax_deductions = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    net_pay = models.DecimalField(max_digits=12, decimal_places=2)
    is_void = models.BooleanField(default=False)
    void_reason = models.TextField(blank=True, null=True)
    reprint_count = models.IntegerField(default=0)
    notes = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f'Paystub for {self.employee} - {self.payment_date}'

class Earning(models.Model):
    EARNING_TYPE_CHOICES = [
        ('regular', 'Regular'),
        ('overtime', 'Overtime'),
        ('double_time', 'Double Time'),
        ('holiday', 'Holiday'),
        ('sick', 'Sick'),
        ('vacation', 'Vacation'),
        ('bonus', 'Bonus'),
        ('commission', 'Commission'),
        ('tips', 'Tips'),
        ('other', 'Other'),
    ]

    earning_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    paystub = models.ForeignKey(Paystub, on_delete=models.CASCADE, related_name='earnings')
    earning_type = models.CharField(max_length=50, choices=EARNING_TYPE_CHOICES)
    hours = models.DecimalField(max_digits=8, decimal_places=2, blank=True, null=True)
    rate = models.DecimalField(max_digits=10, decimal_places=2, blank=True, null=True)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    description = models.CharField(max_length=255, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'{self.get_earning_type_display()} - {self.amount}'

class Deduction(models.Model):
    DEDUCTION_TYPE_CHOICES = [
        ('health_insurance', 'Health Insurance'),
        ('dental_insurance', 'Dental Insurance'),
        ('vision_insurance', 'Vision Insurance'),
        ('life_insurance', 'Life Insurance'),
        ('disability_insurance', 'Disability Insurance'),
        ('retirement_401k', '401(k) Retirement'),
        ('retirement_403b', '403(b) Retirement'),
        ('retirement_roth', 'Roth Retirement'),
        ('fsa_medical', 'FSA Medical'),
        ('fsa_dependent', 'FSA Dependent'),
        ('hsa', 'HSA'),
        ('commuter', 'Commuter'),
        ('tuition_reimbursement', 'Tuition Reimbursement'),
        ('garnishment', 'Garnishment'),
        ('union_dues', 'Union Dues'),
        ('charitable', 'Charitable'),
        ('other', 'Other'),
    ]
    TAX_TREATMENT_CHOICES = [
        ('pre-tax', 'Pre-Tax'),
        ('post-tax', 'Post-Tax'),
    ]

    deduction_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    paystub = models.ForeignKey(Paystub, on_delete=models.CASCADE, related_name='deductions')
    deduction_type = models.CharField(max_length=50, choices=DEDUCTION_TYPE_CHOICES)
    tax_treatment = models.CharField(max_length=20, choices=TAX_TREATMENT_CHOICES)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    description = models.CharField(max_length=255, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'{self.get_deduction_type_display()} - {self.amount}'

class Tax(models.Model):
    TAX_TYPE_CHOICES = [
        ('federal_income', 'Federal Income'),
        ('state_income', 'State Income'),
        ('local_income', 'Local Income'),
        ('social_security', 'Social Security'),
        ('medicare', 'Medicare'),
        ('additional_medicare', 'Additional Medicare'),
        ('sui', 'SUI'),
        ('futa', 'FUTA'),
    ]

    tax_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    paystub = models.ForeignKey(Paystub, on_delete=models.CASCADE, related_name='taxes')
    tax_type = models.CharField(max_length=50, choices=TAX_TYPE_CHOICES)
    employee_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    employer_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    taxable_wages = models.DecimalField(max_digits=12, decimal_places=2, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'{self.get_tax_type_display()} - {self.employee_amount}'