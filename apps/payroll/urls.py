from django.urls import path
from .views import (
    CompanyListCreateAPIView,
    CompanyRetrieveUpdateDestroyAPIView,
    EmployeeListCreateAPIView,
    EmployeeRetrieveUpdateDestroyAPIView,
    PayrollRunListCreateAPIView,
    PayrollRunRetrieveUpdateDestroyAPIView,
    PaystubListCreateAPIView,
    PaystubRetrieveUpdateDestroyAPIView,
)

urlpatterns = [
    path('companies/', CompanyListCreateAPIView.as_view(), name='company-list-create'),
    path('companies/<uuid:pk>/', CompanyRetrieveUpdateDestroyAPIView.as_view(), name='company-retrieve-update-destroy'),
    path('employees/', EmployeeListCreateAPIView.as_view(), name='employee-list-create'),
    path('employees/<uuid:pk>/', EmployeeRetrieveUpdateDestroyAPIView.as_view(), name='employee-retrieve-update-destroy'),
    path('payroll-runs/', PayrollRunListCreateAPIView.as_view(), name='payroll-run-list-create'),
    path('payroll-runs/<uuid:pk>/', PayrollRunRetrieveUpdateDestroyAPIView.as_view(), name='payroll-run-retrieve-update-destroy'),
    path('paystubs/', PaystubListCreateAPIView.as_view(), name='paystub-list-create'),
    path('paystubs/<uuid:pk>/', PaystubRetrieveUpdateDestroyAPIView.as_view(), name='paystub-retrieve-update-destroy'),
]
