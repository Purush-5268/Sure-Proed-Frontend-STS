import json
from django.core.management.base import BaseCommand

class Command(BaseCommand):
    help = "Generates a new set of VAPID keys for Web Push Notifications"

    def handle(self, *args, **options):
        try:
            from py_vapid import Vapid
            import base64
            from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

            v = Vapid()
            v.generate_keys()

            # The pywebpush library accepts URL-safe base64 encoded raw private key (32 bytes)
            # as a string in vapid_private_key.
            raw_priv = v.private_key.private_numbers().private_value.to_bytes(32, 'big')
            b64_priv = base64.urlsafe_b64encode(raw_priv).decode('utf-8').rstrip('=')

            # The frontend PushManager expects URL-safe base64 encoded uncompressed point (65 bytes)
            raw_pub = v.public_key.public_bytes(
                encoding=Encoding.X962,
                format=PublicFormat.UncompressedPoint
            )
            b64_pub = base64.urlsafe_b64encode(raw_pub).decode('utf-8').rstrip('=')
            
            self.stdout.write(self.style.SUCCESS("Successfully generated VAPID keys!"))
            self.stdout.write(self.style.WARNING("\nIMPORTANT: Store these securely in your production environment variables (.env)."))
            self.stdout.write(self.style.WARNING("Do NOT commit them to version control or log them.\n"))
            
            self.stdout.write(f"WEB_PUSH_VAPID_PRIVATE_KEY='{b64_priv}'")
            self.stdout.write(f"WEB_PUSH_VAPID_PUBLIC_KEY='{b64_pub}'")
            self.stdout.write("WEB_PUSH_VAPID_CLAIMS_EMAIL='admin@yourdomain.com'  # Replace with actual admin email\n")
            
        except Exception as e:
            self.stderr.write(self.style.ERROR(f"Failed to generate keys: {e}"))
