from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from .models import Company

class TestCompanyAPI(APITestCase):
    def test_create_company(self):
        """_summary_
        Ensure we can create a new company object.
        """
        url = reverse('company-list-create')
        data = {
            'name': 'Test Company',
            'address': '123 Test St',
            'phone': '123-456-7890',
        }
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Company.objects.count(), 1)
        self.assertEqual(Company.objects.get().name, 'Test Company')

    def test_get_company_list(self):
        """_summary_
        Ensure we can retrieve a list of companies.
        """
        Company.objects.create(name='Test Company 1', address='123 Test St', phone='123-456-7890')
        Company.objects.create(name='Test Company 2', address='456 Test St', phone='987-654-3210')
        url = reverse('company-list-create')
        response = self.client.get(url, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)
