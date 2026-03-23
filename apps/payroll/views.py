from rest_framework import generics
from .models import Company, Employee, PayrollRun, Paystub
from .serializers import CompanySerializer, EmployeeSerializer, PayrollRunSerializer, PaystubSerializer

class CompanyListCreateAPIView(generics.ListCreateAPIView):
    queryset = Company.objects.all()
    serializer_class = CompanySerializer

class CompanyRetrieveUpdateDestroyAPIView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Company.objects.all()
    serializer_class = CompanySerializer

class EmployeeListCreateAPIView(generics.ListCreateAPIView):
    queryset = Employee.objects.all()
    serializer_class = EmployeeSerializer

class EmployeeRetrieveUpdateDestroyAPIView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Employee.objects.all()
    serializer_class = EmployeeSerializer

class PayrollRunListCreateAPIView(generics.ListCreateAPIView):
    queryset = PayrollRun.objects.all()
    serializer_class = PayrollRunSerializer

class PayrollRunRetrieveUpdateDestroyAPIView(generics.RetrieveUpdateDestroyAPIView):
    queryset = PayrollRun.objects.all()
    serializer_class = PayrollRunSerializer

class PaystubListCreateAPIView(generics.ListCreateAPIView):
    queryset = Paystub.objects.all()
    serializer_class = PaystubSerializer

class PaystubRetrieveUpdateDestroyAPIView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Paystub.objects.all()
    serializer_class = PaystubSerializer
