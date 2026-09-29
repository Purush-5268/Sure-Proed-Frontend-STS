import os
import subprocess
import base64
from io import BytesIO
import qrcode
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from django_otp.plugins.otp_totp.models import TOTPDevice

User = get_user_model()

class Command(BaseCommand):
    help = 'Sets up 2FA TOTP device for a user, updates Nginx htpasswd, reloads Nginx, and generates QR code'

    def add_arguments(self, parser):
        parser.add_argument('email', type=str, help='The email of the user to setup 2FA for')
        parser.add_argument('--password', type=str, help='Optional password for Nginx htpasswd sync', default=None)
        parser.add_argument('--htpasswd-path', type=str, help='Path to htpasswd file', default='/etc/nginx/.htpasswd')

    def handle(self, *args, **kwargs):
        email = kwargs['email']
        password = kwargs['password']
        htpasswd_path = kwargs['htpasswd_path']
        
        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            self.stdout.write(self.style.ERROR(f'User with email {email} does not exist. Creating user...'))
            if not password:
                password = 'SomeshPassword123'
            user = User.objects.create_superuser(email=email, password=password)
            self.stdout.write(self.style.SUCCESS(f'Created superuser account for {email}'))

        # 1. Reset and Create 2FA TOTP Device
        TOTPDevice.objects.filter(user=user).delete()
        device = TOTPDevice.objects.create(
            user=user,
            name='default',
            confirmed=True
        )

        url = device.config_url
        self.stdout.write(self.style.SUCCESS(f'Successfully created 2FA device for {email}!'))

        # 2. Update Nginx htpasswd if password provided and running on Linux
        if password:
            self.stdout.write(self.style.NOTICE(f'Updating Nginx htpasswd at {htpasswd_path}...'))
            try:
                # Add/Update user in htpasswd file
                flag = "-b" if os.path.exists(htpasswd_path) else "-bc"
                cmd_ht = f"sudo htpasswd {flag} {htpasswd_path} '{email}' '{password}'"
                result = subprocess.run(cmd_ht, shell=True, capture_output=True, text=True)
                if result.returncode == 0:
                    self.stdout.write(self.style.SUCCESS(f'Successfully added {email} to {htpasswd_path}'))
                    
                    # Test Nginx
                    self.stdout.write(self.style.NOTICE('Testing Nginx configuration (sudo nginx -t)...'))
                    res_t = subprocess.run("sudo nginx -t", shell=True, capture_output=True, text=True)
                    if res_t.returncode == 0:
                        # Reload Nginx
                        res_r = subprocess.run("sudo systemctl reload nginx", shell=True, capture_output=True, text=True)
                        if res_r.returncode == 0:
                            self.stdout.write(self.style.SUCCESS('Successfully reloaded Nginx service!'))
                        else:
                            self.stdout.write(self.style.WARNING(f'Nginx reload notice: {res_r.stderr}'))
                    else:
                        self.stdout.write(self.style.WARNING(f'Nginx test notice: {res_t.stderr}'))
                else:
                    self.stdout.write(self.style.WARNING(f'htpasswd notice: {result.stderr}'))
            except Exception as e:
                self.stdout.write(self.style.WARNING(f'Nginx auto-sync skipped: {e}'))
        else:
            self.stdout.write(self.style.WARNING(f'\nTo sync with Nginx htpasswd, run:\n  sudo htpasswd {htpasswd_path} {email}\n  sudo nginx -t\n  sudo systemctl reload nginx\n'))
        
        # 3. Generate QR Code Image Base64 Data URL
        self.stdout.write(self.style.WARNING('\n--- SECURE QR CODE IMAGE ---\n'))
        self.stdout.write('Copy the string below and paste it into your browser address bar to view your 2FA QR code:\n')
        
        img = qrcode.make(url)
        buffer = BytesIO()
        img.save(buffer, format='PNG')
        b64_str = base64.b64encode(buffer.getvalue()).decode('utf-8')
        data_url = f"data:image/png;base64,{b64_str}"
        self.stdout.write(self.style.SUCCESS(data_url + '\n'))
        
        self.stdout.write(self.style.WARNING('IMPORTANT: Clear your terminal screen after scanning/copying!\n'))
