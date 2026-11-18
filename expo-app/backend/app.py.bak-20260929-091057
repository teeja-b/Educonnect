from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from flask_bcrypt import Bcrypt
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity
from datetime import datetime, timedelta
import os
from werkzeug.utils import secure_filename
import json
from functools import wraps
import jwt
from flask import request, jsonify
from reportlab.lib.pagesizes import letter, A4
from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, Image
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER
import io
from datetime import datetime
from reportlab.lib.pagesizes import letter, landscape
from reportlab.platypus import Table, TableStyle
from datetime import datetime
from flask_socketio import SocketIO, emit, join_room, leave_room
import sys
from flask_migrate import Migrate
from flask import Flask, request, jsonify
from flask_mailman import Mail, EmailMessage 
from itsdangerous import URLSafeTimedSerializer, SignatureExpired, BadSignature
from datetime import datetime, timedelta
import secrets
from dotenv import load_dotenv
import os
from flask_bcrypt import check_password_hash, generate_password_hash
from flask import Flask, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from ml_matcher import RLTutorMatchingSystem
from sqlalchemy import event
from sqlalchemy.engine import Engine
load_dotenv()
import cloudinary
import cloudinary.uploader
import hashlib
import time
import uuid
import urllib.parse
import requests
import firebase_admin
from firebase_admin import credentials, messaging as fcm_messaging
from expo_push import is_expo_token, send_expo_push

# Add this after your other imports
import json

FIREBASE_ENABLED = False
try:
    import firebase_admin
    from firebase_admin import credentials, messaging as fcm_messaging
    FIREBASE_AVAILABLE = True
except ImportError:
    print("⚠️ firebase-admin not installed. Run: pip install firebase-admin")
    FIREBASE_AVAILABLE = False

def initialize_firebase():
    """
    Initialize Firebase Admin SDK for PRODUCTION
    
    Setup Instructions:
    1. Go to Firebase Console > Project Settings > Service Accounts
    2. Click "Generate New Private Key"
    3. Copy the ENTIRE JSON content
    4. In Render.com dashboard:
       - Go to Environment Variables
       - Add: FIREBASE_CREDENTIALS
       - Paste the entire JSON as the value
    """
    
    try:
        firebase_creds = os.getenv('FIREBASE_CREDENTIALS')
        
        if not firebase_creds:
            print("❌ FIREBASE_CREDENTIALS not found in environment variables")
            print("⚠️  Push notifications will NOT work!")
            return False
        
        # Parse JSON from environment variable
        cred_dict = json.loads(firebase_creds)
        cred = credentials.Certificate(cred_dict)
        
        firebase_admin.initialize_app(cred)
        print("✅ Firebase Admin initialized successfully (PRODUCTION)")
        return True  # ✅ RETURN True on success
        
    except json.JSONDecodeError as e:
        print(f"❌ Invalid JSON in FIREBASE_CREDENTIALS: {e}")
        print("⚠️  Check your environment variable formatting")
        return False
    except Exception as e:
        print(f"❌ Firebase Admin initialization failed: {e}")
        import traceback
        traceback.print_exc()
        return False

def init_firebase_global():
    """Initialize Firebase and set global variable"""
    global FIREBASE_ENABLED  # ✅ Explicitly declare we're modifying the global
    
    print("\n" + "="*70)
    print("Initializing Firebase Admin SDK...")
    print("="*70)
    
    try:
        FIREBASE_ENABLED = initialize_firebase()
        
        if FIREBASE_ENABLED:
            print("✅ FIREBASE_ENABLED set to True")
        else:
            print("⚠️ FIREBASE_ENABLED set to False")
            
    except Exception as e:
        print(f"❌ Failed to initialize Firebase: {e}")
        FIREBASE_ENABLED = False
    
    print(f"📊 Final FIREBASE_ENABLED status: {FIREBASE_ENABLED}")
    print("="*70 + "\n")

# Call the initialization function
init_firebase_global()
cloudinary.config(
    cloud_name=os.getenv('CLOUDINARY_CLOUD_NAME'),
    api_key=os.getenv('CLOUDINARY_API_KEY'),
    api_secret=os.getenv('CLOUDINARY_API_SECRET')
)
# Reduce memory usage
os.environ['OPENBLAS_NUM_THREADS'] = '1'
os.environ['MKL_NUM_THREADS'] = '1'

rl_system = RLTutorMatchingSystem()

MODEL_PATH = 'rl_model.pkl'
if os.path.exists(MODEL_PATH):
    rl_system.load_model(MODEL_PATH)
    print("✓ Loaded existing RL model")
else:
    print("✓ Starting with fresh RL model")

update_counter = 0

db = SQLAlchemy()
app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')
active_connections = {}  # {user_id: sid}
user_rooms = {}  # {user_id: [room_ids]}
CORS(app)
DAILY_API_KEY = os.getenv('DAILY_API_KEY')




# Configuration
basedir = os.path.abspath(os.path.dirname(__file__))
app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv(
    'DATABASE_URL',
    'sqlite:///educonnect.db'  # Fallback for local development
)
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['JWT_SECRET_KEY'] = os.environ.get('JWT_SECRET_KEY', 'your-secret-key-change-in-production')
app.config['JWT_ACCESS_TOKEN_EXPIRES'] = timedelta(days=30)
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['MAX_CONTENT_LENGTH'] = 500 * 1024 * 1024
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY')
app.config['SECURITY_PASSWORD_SALT'] = os.getenv('SECURITY_PASSWORD_SALT')
app.config['MAIL_USE_TLS'] = os.getenv('MAIL_USE_TLS') == 'True'
app.config['MAIL_SERVER'] = os.getenv('MAIL_SERVER')
app.config['MAIL_PORT'] = int(os.getenv('MAIL_PORT', 587))
app.config['MAIL_USE_TLS'] = True
app.config['MAIL_USERNAME'] = os.getenv('MAIL_USERNAME')
app.config['MAIL_PASSWORD'] = os.getenv('MAIL_PASSWORD')
app.config['MAIL_DEFAULT_SENDER'] = os.getenv('MAIL_DEFAULT_SENDER')

app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv(
    'DATABASE_URL',
    'sqlite:///educonnect.db'
)
app.config['SECRET_KEY'] = os.environ.get(
    'SECRET_KEY',
    'dev-secret-key-change-in-production'
)
if app.config['SQLALCHEMY_DATABASE_URI'].startswith('postgres://'):
    app.config['SQLALCHEMY_DATABASE_URI'] = app.config['SQLALCHEMY_DATABASE_URI'].replace('postgres://', 'postgresql://', 1)
mail = Mail(app)
serializer = URLSafeTimedSerializer(app.config['SECRET_KEY'])
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
os.makedirs(os.path.join(app.config['UPLOAD_FOLDER'], 'courses'), exist_ok=True)
os.makedirs(os.path.join(app.config['UPLOAD_FOLDER'], 'materials'), exist_ok=True)

db.init_app(app)
bcrypt = Bcrypt(app)
jwt = JWTManager(app) 
@jwt.expired_token_loader
def expired_token_callback(jwt_header, jwt_payload):
    return jsonify({'error': 'Token has expired'}), 401

@jwt.invalid_token_loader
def invalid_token_callback(error):
    return jsonify({'error': 'Invalid token'}), 401

@jwt.unauthorized_loader
def missing_token_callback(error):
    return jsonify({'error': 'Authorization required'}), 401
migrate = Migrate(app, db)
mail.init_app(app)

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        
        # Check if token is in headers
        if 'Authorization' in request.headers:
            auth_header = request.headers['Authorization']
            try:
                token = auth_header.split(" ")[1]  # Bearer <token>
            except IndexError:
                return jsonify({'error': 'Invalid token format'}), 401
        
        if not token:
            return jsonify({'error': 'Token is missing'}), 401
        
        try:
            # Decode token
            data = jwt.decode(token, app.config['SECRET_KEY'], algorithms=["HS256"])
            current_user = User.query.get(data['user_id'])
            
            if not current_user:
                return jsonify({'error': 'User not found'}), 401
                
        except jwt.ExpiredSignatureError:
            return jsonify({'error': 'Token has expired'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'error': 'Invalid token'}), 401
        except Exception as e:
            return jsonify({'error': str(e)}), 401
        
        return f(current_user, *args, **kwargs)
    
    return decorated



app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {
    'pool_size': 10,
    'pool_recycle': 3600,
    'pool_pre_ping': True
}



# ============================================================================
# DATABASE MODELS
# ============================================================================


class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    user_type = db.Column(db.String(20), nullable=False)
    full_name = db.Column(db.String(100), nullable=False)
    country_code = db.Column(db.String(5))
    income_level = db.Column(db.String(50))
    phone_verified = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    email_verified = db.Column(db.Boolean, default=False)
    email_verification_token = db.Column(db.String(100))
    reset_password_token = db.Column(db.String(100))
    reset_password_expires = db.Column(db.DateTime)
    failed_login_attempts = db.Column(db.Integer, default=0)
    account_locked_until = db.Column(db.DateTime)
    student_profile = db.relationship('StudentProfile', backref='user', uselist=False, cascade='all, delete-orphan')
    tutor_profile = db.relationship('TutorProfile', backref='user', uselist=False, cascade='all, delete-orphan')
    enrollments = db.relationship('Enrollment', backref='student', cascade='all, delete-orphan')
    phone = db.Column(db.String(20))
    location = db.Column(db.String(100))
    date_of_birth = db.Column(db.Date)
    gender = db.Column(db.String(20))

class FCMToken(db.Model):
    """Store FCM tokens for users"""
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    token = db.Column(db.String(500), nullable=False, unique=True)
    device_type = db.Column(db.String(50))  # 'web', 'android', 'ios'
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    last_used = db.Column(db.DateTime, default=datetime.utcnow)
    is_active = db.Column(db.Boolean, default=True)

class StudentProfile(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    learning_style = db.Column(db.String(50))
    preferred_subjects = db.Column(db.Text)
    skill_level = db.Column(db.String(50))
    learning_goals = db.Column(db.Text)
    available_time = db.Column(db.String(50))
    preferred_languages = db.Column(db.Text)
    survey_completed = db.Column(db.Boolean, default=False)
    math_score = db.Column(db.Integer)
    science_score = db.Column(db.Integer)
    language_score = db.Column(db.Integer)
    tech_score = db.Column(db.Integer)
    motivation_level = db.Column(db.Integer)
    tutor_gender_preference = db.Column(db.String(20), default='no_preference')
    selected_goals = db.Column(db.Text)  

    bio = db.Column(db.Text)
    weekly_study_hours = db.Column(db.String(20))
    preferred_session_length = db.Column(db.String(10))
    learning_pace = db.Column(db.String(20))

class TutorProfile(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    expertise = db.Column(db.Text)
    bio = db.Column(db.Text)
    hourly_rate = db.Column(db.Float)
    rating = db.Column(db.Float, default=0.0)
    total_sessions = db.Column(db.Integer, default=0)
    languages = db.Column(db.Text)
    availability = db.Column(db.Text)
    verified = db.Column(db.Boolean, default=False)
    
    courses = db.relationship('Course', backref='tutor', cascade='all, delete-orphan')

    teaching_style = db.Column(db.String(50))
    years_experience = db.Column(db.String(10))
    education = db.Column(db.Text)
    certifications = db.Column(db.Text)
    specializations = db.Column(db.Text)
    teaching_philosophy = db.Column(db.Text)
    min_session_length = db.Column(db.String(10))
    max_students = db.Column(db.String(10))
    preferred_age_groups = db.Column(db.Text)  # JSON array

class Course(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    tutor_id = db.Column(db.Integer, db.ForeignKey('tutor_profile.id'), nullable=False)
    title = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text)
    category = db.Column(db.String(50))
    level = db.Column(db.String(50))
    duration = db.Column(db.String(50))
    price = db.Column(db.Float, default=0.0)
    rating = db.Column(db.Float, default=0.0)
    total_students = db.Column(db.Integer, default=0)
    offline_available = db.Column(db.Boolean, default=False)
    published = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    materials = db.relationship('CourseMaterial', backref='course', cascade='all, delete-orphan')
    enrollments = db.relationship('Enrollment', backref='course', cascade='all, delete-orphan')

class CourseSection(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    course_id = db.Column(db.Integer, db.ForeignKey('course.id'), nullable=False)
    title = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text)
    order = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    materials = db.relationship('CourseMaterial', backref='section', cascade='all, delete-orphan')
    
class CourseMaterial(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    course_id = db.Column(db.Integer, db.ForeignKey('course.id'), nullable=False)
    section_id = db.Column(db.Integer, db.ForeignKey('course_section.id'), nullable=True)
    title = db.Column(db.String(200), nullable=False)
    material_type = db.Column(db.String(50))
    file_path = db.Column(db.String(500))
    file_size = db.Column(db.Integer)
    order = db.Column(db.Integer)
    duration = db.Column(db.Integer)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class Enrollment(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    course_id = db.Column(db.Integer, db.ForeignKey('course.id'), nullable=False)
    enrolled_at = db.Column(db.DateTime, default=datetime.utcnow)
    progress = db.Column(db.Float, default=0.0)
    completed = db.Column(db.Boolean, default=False)
    certificate_issued = db.Column(db.Boolean, default=False)

class OfflineDownload(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    course_id = db.Column(db.Integer, db.ForeignKey('course.id'), nullable=False)
    downloaded_at = db.Column(db.DateTime, default=datetime.utcnow)
    expires_at = db.Column(db.DateTime)



class Conversation(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    participant1_id = db.Column(db.Integer, db.ForeignKey('user.id'))
    participant2_id = db.Column(db.Integer, db.ForeignKey('user.id'))
    last_message = db.Column(db.String(500))
    last_message_time = db.Column(db.DateTime)

class Message(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    conversation_id = db.Column(db.Integer, db.ForeignKey('conversation.id'))
    sender_id = db.Column(db.Integer, db.ForeignKey('user.id'))
    text = db.Column(db.String(1000))
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)
    file_url = db.Column(db.String(500))      # 🔥 ADD THIS
    file_type = db.Column(db.String(50))      # 🔥 ADD THIS (image/voice/file)
    file_name = db.Column(db.String(255))  

# Optional: Booking model
class Booking(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    tutor_id = db.Column(db.Integer, db.ForeignKey('user.id'))
    student_id = db.Column(db.Integer, db.ForeignKey('user.id'))
    subject = db.Column(db.String(100))
    date = db.Column(db.String(20))
    time = db.Column(db.String(20))
    duration = db.Column(db.Integer)
    status = db.Column(db.String(20))
    notes = db.Column(db.String(500))


class Assignment(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    tutor_id = db.Column(db.Integer, db.ForeignKey('tutor_profile.id'), nullable=False)
    course_id = db.Column(db.Integer, db.ForeignKey('course.id'), nullable=True)
    title = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text)
    due_date = db.Column(db.DateTime, nullable=False)
    max_score = db.Column(db.Integer, default=100)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relationships
    submissions = db.relationship('AssignmentSubmission', backref='assignment', cascade='all, delete-orphan')

class AssignmentSubmission(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    assignment_id = db.Column(db.Integer, db.ForeignKey('assignment.id'), nullable=False)
    student_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    submitted_at = db.Column(db.DateTime, default=datetime.utcnow)
    status = db.Column(db.String(20), default='submitted')  # submitted, graded, late
    score = db.Column(db.Integer)
    grade = db.Column(db.String(5))  # A, B+, etc.
    feedback = db.Column(db.Text)
    comments = db.Column(db.Text)  # Student's submission comments
    files = db.Column(db.Text)  # JSON array of file paths
    rubric_scores = db.Column(db.Text)  # JSON array of rubric scores
    late_submission = db.Column(db.Boolean, default=False)
    
    # Relationships
    student = db.relationship('User', backref='assignment_submissions')



def send_fcm_notification(user_id, title, body, data=None, notification_type='general'):
    """Send a push to every active device of a user (phone via Expo, browser via FCM)."""
    try:
        all_tokens = FCMToken.query.filter_by(user_id=user_id, is_active=True).all()
        if not all_tokens:
            print(f"⚠️ No push tokens found for user {user_id}")
            return False
 
        expo_tokens = [t for t in all_tokens if is_expo_token(t.token)]
        web_tokens = [t for t in all_tokens if not is_expo_token(t.token)]
 
        base_data = dict(data or {})
        base_data['type'] = notification_type
        base_data['timestamp'] = datetime.utcnow().isoformat()
        base_data['user_id'] = str(user_id)
 
        # ── Phones (Expo) ────────────────────────────────────────────────────
        expo_ok = 0
        if expo_tokens:
            emoji = {'call': '📞', 'message': '💬'}.get(notification_type, '🔔')
            expo_ok, dead = send_expo_push(
                [t.token for t in expo_tokens],
                f"{emoji} {title}", body, base_data, notification_type,
            )
            for t in expo_tokens:
                if t.token in dead:
                    t.is_active = False
                else:
                    t.last_used = datetime.utcnow()
            db.session.commit()
 
        # ── Browsers (FCM web push) ──────────────────────────────────────────
        web_ok = 0
        if web_tokens:
            if not FIREBASE_ENABLED:
                print("⚠️ Firebase not enabled — skipping browser push")
            else:
                frontend_url = os.getenv('FRONTEND_URL', 'https://hult-ten.vercel.app')
                click_url = base_data.get('url') or frontend_url
                if not click_url.startswith('http'):
                    click_url = frontend_url + click_url
                click_url = click_url.replace('http://', 'https://')
                string_data = {k: str(v) for k, v in base_data.items() if v is not None}
                channel = {'call': 'incoming_calls_v2', 'message': 'messages'}.get(notification_type, 'general')
 
                invalid = []
                for token_obj in web_tokens:
                    try:
                        message = fcm_messaging.Message(
                            notification=fcm_messaging.Notification(title=title, body=body),
                            data=string_data,
                            token=token_obj.token,
                            webpush=fcm_messaging.WebpushConfig(
                                notification=fcm_messaging.WebpushNotification(
                                    title=title, body=body,
                                    icon=f"{frontend_url}/logo192.png",
                                    tag=notification_type,
                                    require_interaction=(notification_type == 'call'),
                                ),
                                fcm_options=fcm_messaging.WebpushFCMOptions(link=click_url),
                                headers={'TTL': '45' if notification_type == 'call' else '86400',
                                         'Urgency': 'high' if notification_type == 'call' else 'normal'},
                            ),
                            android=fcm_messaging.AndroidConfig(
                                priority='high',
                                notification=fcm_messaging.AndroidNotification(
                                    title=title, body=body, sound='default', channel_id=channel,
                                ),
                            ),
                        )
                        fcm_messaging.send(message)
                        token_obj.last_used = datetime.utcnow()
                        web_ok += 1
                    except (fcm_messaging.UnregisteredError, fcm_messaging.SenderIdMismatchError):
                        invalid.append(token_obj)
                    except Exception as e:
                        print(f"❌ Error sending web push to token {token_obj.id}: {e}")
                for t in invalid:
                    t.is_active = False
                db.session.commit()
 
        print(f"📊 Push results for user {user_id}: phone {expo_ok}/{len(expo_tokens)}, web {web_ok}/{len(web_tokens)}")
        return (expo_ok + web_ok) > 0
 
    except Exception as e:
        db.session.rollback()
        print(f"❌ Error sending notification: {e}")
        import traceback
        traceback.print_exc()
        return False
 
 
# ── 3. REPLACE the whole `def send_call_notification(...)` function ──────────
#    (adds the camelCase keys the app reads when Accept/Decline is tapped)
 
def send_call_notification(caller_id, receiver_id, meeting_id, join_url):
    """Send incoming call notification (with Accept / Decline buttons on phones)."""
    try:
        caller = User.query.get(caller_id)
        if not caller:
            return False
        frontend_url = os.getenv('FRONTEND_URL', 'https://hult-ten.vercel.app')
        return send_fcm_notification(
            user_id=receiver_id,
            title=f"Incoming call from {caller.full_name}",
            body="Tap to answer",
            data={
                'type': 'call',
                'meetingId': meeting_id,
                'meeting_id': meeting_id,
                'callerId': str(caller_id),
                'caller_id': str(caller_id),
                'callerName': caller.full_name,
                'caller_name': caller.full_name,
                'joinUrl': join_url or '',
                'url': f"{frontend_url}/video-call?meetingId={meeting_id}",
            },
            notification_type='call',
        )
    except Exception as e:
        print(f"❌ Error sending call notification: {e}")
        return False
 
 
# ── 4. ADD this endpoint (anywhere with the other routes) ────────────────────
#    Used when "Decline" is tapped on the notification while the app is closed
#    (no socket connection), so the caller's phone stops ringing.
 
@app.route('/api/calls/decline', methods=['POST'])
@jwt_required()
def decline_call_http():
    try:
        user_id = int(get_jwt_identity())
        data = request.get_json() or {}
        meeting_id = data.get('meetingId')
        caller_id = data.get('callerId')
        if not meeting_id or caller_id is None:
            return jsonify({'error': 'meetingId and callerId are required'}), 400
 
        payload = {'meetingId': meeting_id, 'declinedBy': user_id}
        # active_connections keys may be int or str depending on the client
        caller_sid = active_connections.get(caller_id) \
            or active_connections.get(str(caller_id)) \
            or (active_connections.get(int(caller_id)) if str(caller_id).isdigit() else None)
        if caller_sid:
            socketio.emit('call_declined', payload, room=caller_sid)
            print(f"❌ [VIDEO] Call {meeting_id} declined by {user_id} (from notification)")
        return jsonify({'success': True, 'caller_notified': bool(caller_sid)}), 200
    except Exception as e:
        print(f"❌ [VIDEO] decline error: {e}")
        return jsonify({'error': str(e)}), 500
# ============================================================================
# TUTORING SESSION TIME-LIMIT MODEL & ENDPOINTS
# ============================================================================

class TutoringSession(db.Model):
    """Tracks a 1-hour tutoring session between a student and tutor."""
    id              = db.Column(db.Integer, primary_key=True)
    student_id      = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    tutor_user_id   = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    conversation_id = db.Column(db.Integer, db.ForeignKey('conversation.id'), nullable=True)
    started_at      = db.Column(db.DateTime, default=datetime.utcnow)
    expires_at      = db.Column(db.DateTime, nullable=False)
    status          = db.Column(db.String(20), default='active')
    # status: 'active' | 'expired' | 'reopened'
    reopened_at     = db.Column(db.DateTime, nullable=True)
    reopened_by     = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)

    SESSION_MINUTES = 60  # change to any value for testing


@app.route('/api/sessions/start', methods=['POST'])
@jwt_required()
def start_tutoring_session():
    """
    Student or tutor calls this when a conversation first opens.
    If an active/reopened session already exists between the pair it is returned
    unchanged; otherwise a fresh 1-hour session is created.

    Body: { "tutor_user_id": <int>, "conversation_id": <int|null> }
    """
    try:
        caller_id      = int(get_jwt_identity())
        data           = request.get_json() or {}
        tutor_user_id  = data.get('tutor_user_id')
        conversation_id = data.get('conversation_id')

        if not tutor_user_id:
            return jsonify({'error': 'tutor_user_id is required'}), 400

        # Determine canonical student / tutor ids regardless of who calls
        caller = User.query.get(caller_id)
        if caller.user_type == 'tutor':
            student_id_ = data.get('student_id')
            if not student_id_:
                return jsonify({'error': 'student_id is required'}), 400
            tutor_user_id_ = caller_id
        else:
            student_id_    = caller_id
            tutor_user_id_ = int(tutor_user_id)

        # Check for an existing non-expired session
        existing = TutoringSession.query.filter(
            TutoringSession.student_id    == student_id_,
            TutoringSession.tutor_user_id == tutor_user_id_,
            TutoringSession.status.in_(['active', 'reopened'])
        ).order_by(TutoringSession.started_at.desc()).first()

        if existing:
            # If clock ran out but DB status not yet updated, expire it now
            if existing.expires_at < datetime.utcnow() and existing.status == 'active':
                existing.status = 'expired'
                db.session.commit()
                _push_session_status(existing)
            else:
                return jsonify(_session_dict(existing)), 200

        # Create fresh session
        now        = datetime.utcnow()
        expires_at = now + timedelta(minutes=TutoringSession.SESSION_MINUTES)
        session    = TutoringSession(
            student_id      = student_id_,
            tutor_user_id   = tutor_user_id_,
            conversation_id = conversation_id,
            started_at      = now,
            expires_at      = expires_at,
            status          = 'active'
        )
        db.session.add(session)
        db.session.commit()

        print(f"✅ [SESSION] Started session {session.id} — expires {expires_at}")
        return jsonify(_session_dict(session)), 201

    except Exception as e:
        db.session.rollback()
        print(f"❌ [SESSION START] {e}")
        import traceback; traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/api/sessions/status', methods=['GET'])
@jwt_required()
def get_session_status():
    """
    Poll for the current session state.
    Query params: tutor_user_id=<int>  (student calls this)
                  student_id=<int>     (tutor calls this)
    """
    try:
        caller_id = int(get_jwt_identity())
        caller    = User.query.get(caller_id)

        if caller.user_type == 'student':
            tutor_user_id = request.args.get('tutor_user_id', type=int)
            if not tutor_user_id:
                return jsonify({'error': 'tutor_user_id required'}), 400
            student_id_    = caller_id
            tutor_user_id_ = tutor_user_id
        else:
            student_id = request.args.get('student_id', type=int)
            if not student_id:
                return jsonify({'error': 'student_id required'}), 400
            student_id_    = student_id
            tutor_user_id_ = caller_id

        session = TutoringSession.query.filter(
            TutoringSession.student_id    == student_id_,
            TutoringSession.tutor_user_id == tutor_user_id_
        ).order_by(TutoringSession.started_at.desc()).first()

        if not session:
            return jsonify({'session': None}), 200

        # Auto-expire if clock ran out
        if session.status == 'active' and session.expires_at < datetime.utcnow():
            session.status = 'expired'
            db.session.commit()
            _push_session_status(session)

        return jsonify(_session_dict(session)), 200

    except Exception as e:
        print(f"❌ [SESSION STATUS] {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/sessions/<int:session_id>/reopen', methods=['POST'])
@jwt_required()
def reopen_tutoring_session():
    """
    Tutor-only. Reopen an expired session, giving the student another
    SESSION_MINUTES of access.
    """
    try:
        caller_id = int(get_jwt_identity())
        caller    = User.query.get(caller_id)

        if not caller or caller.user_type != 'tutor':
            return jsonify({'error': 'Only tutors can reopen sessions'}), 403

        session = TutoringSession.query.get(session_id)
        if not session:
            return jsonify({'error': 'Session not found'}), 404

        if session.tutor_user_id != caller_id:
            return jsonify({'error': 'Not authorised'}), 403

        now            = datetime.utcnow()
        session.status      = 'reopened'
        session.reopened_at = now
        session.reopened_by = caller_id
        session.expires_at  = now + timedelta(minutes=TutoringSession.SESSION_MINUTES)
        db.session.commit()

        # Push live update to student
        _push_session_status(session)

        print(f"✅ [SESSION] Tutor {caller_id} reopened session {session_id}")
        return jsonify(_session_dict(session)), 200

    except Exception as e:
        db.session.rollback()
        print(f"❌ [SESSION REOPEN] {e}")
        return jsonify({'error': str(e)}), 500


# ── helpers ──────────────────────────────────────────────────────────────────

def _session_dict(s):
    """Serialise a TutoringSession to a plain dict."""
    now    = datetime.utcnow()
    active = s.status in ('active', 'reopened') and s.expires_at > now
    return {
        'id':              s.id,
        'student_id':      s.student_id,
        'tutor_user_id':   s.tutor_user_id,
        'conversation_id': s.conversation_id,
        'started_at':      s.started_at.isoformat(),
        'expires_at':      s.expires_at.isoformat(),
        'status':          s.status,
        'is_active':       active,
        'seconds_remaining': max(0, int((s.expires_at - now).total_seconds())) if active else 0,
        'reopened_at':     s.reopened_at.isoformat() if s.reopened_at else None,
    }


def _push_session_status(session):
    """Emit session_status_update via Socket.IO to both participants."""
    payload = _session_dict(session)
    for uid in (session.student_id, session.tutor_user_id):
        sid = active_connections.get(uid) or active_connections.get(str(uid))
        if sid:
            socketio.emit('session_status_update', payload, room=sid)
            print(f"  📡 [SESSION] Pushed status '{session.status}' to user {uid}")


@socketio.on('check_session_expired')
def handle_check_session_expired(data):
    """
    Client-side timer fires this when it reaches zero.
    We confirm expiry in the DB and push the update to both parties.
    """
    session_id = data.get('sessionId')
    if not session_id:
        return

    session = TutoringSession.query.get(session_id)
    if not session:
        return

    if session.status == 'active' and session.expires_at <= datetime.utcnow():
        session.status = 'expired'
        db.session.commit()
        _push_session_status(session)
        print(f"✅ [SESSION] Session {session_id} confirmed expired via socket event")

def send_message_notification(sender_id, receiver_id, message_text, conversation_id):
    """Send new message notification"""
    try:
        sender = User.query.get(sender_id)
        if not sender:
            return False
        
        # Truncate long messages
        preview = message_text[:50] + '...' if len(message_text) > 50 else message_text
        
        frontend_url = os.getenv('FRONTEND_URL', 'https://hult-ten.vercel.app')
        
        return send_fcm_notification(
            user_id=receiver_id,
            title=f"New message from {sender.full_name}",
            body=preview,
            data={
                'type': 'message',
                'sender_id': str(sender_id),
                'sender_name': sender.full_name,
                'conversation_id': str(conversation_id),
                'url': f"{frontend_url}/messages"
            },
            notification_type='message'
        )
    except Exception as e:
        print(f"❌ Error sending message notification: {e}")
        return False

@app.route('/api/notifications/register-token', methods=['POST'])
@jwt_required()
def register_fcm_token():
    """Register or update FCM token for user"""
    try:
        user_id_str = get_jwt_identity()
        user_id = int(user_id_str)
        
        data = request.get_json()
        token = data.get('token')
        device_type = data.get('device_type', 'web')
        
        if not token:
            return jsonify({'error': 'Token is required'}), 400
        
        print(f"[FCM] Registering token for user {user_id}")
        
        # Check if token already exists
        existing_token = FCMToken.query.filter_by(token=token).first()
        
        if existing_token:
            # Update existing token
            existing_token.user_id = user_id
            existing_token.device_type = device_type
            existing_token.last_used = datetime.utcnow()
            existing_token.is_active = True
            print(f"[FCM] Updated existing token")
        else:
            # Create new token
            new_token = FCMToken(
                user_id=user_id,
                token=token,
                device_type=device_type
            )
            db.session.add(new_token)
            print(f"[FCM] Created new token")
        
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'Token registered successfully'
        }), 200
        
    except Exception as e:
        db.session.rollback()
        print(f"❌ [FCM] Error registering token: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Failed to register token'}), 500


@app.route('/api/notifications/unregister-token', methods=['POST'])
@jwt_required()
def unregister_fcm_token():
    """Unregister FCM token (on logout)"""
    try:
        data = request.get_json()
        token = data.get('token')
        
        if not token:
            return jsonify({'error': 'Token is required'}), 400
        
        token_obj = FCMToken.query.filter_by(token=token).first()
        
        if token_obj:
            token_obj.is_active = False
            db.session.commit()
            print(f"[FCM] Token unregistered successfully")
        
        return jsonify({
            'success': True,
            'message': 'Token unregistered successfully'
        }), 200
        
    except Exception as e:
        db.session.rollback()
        print(f"❌ [FCM] Error unregistering token: {e}")
        return jsonify({'error': 'Failed to unregister token'}), 500


@app.route('/api/tutors/<int:tutor_id>/profile', methods=['GET'])
def get_public_tutor_profile(tutor_id):
    """Public tutor profile — used by TutorProfileViewer and AITutorMatcher"""
    try:
        tutor = TutorProfile.query.filter_by(user_id=tutor_id).first()
        if not tutor:
            # also try by profile id
            tutor = TutorProfile.query.get(tutor_id)
        if not tutor:
            return jsonify({'error': 'Tutor not found'}), 404

        user = User.query.get(tutor.user_id)
        if not user:
            return jsonify({'error': 'User not found'}), 404

        return jsonify({
            'tutor': {
                'id': tutor.id,
                'user_id': tutor.user_id,
                'name': user.full_name,
                'bio': tutor.bio or '',
                'expertise': json.loads(tutor.expertise or '[]'),
                'languages': json.loads(tutor.languages or '[]'),
                'availability': json.loads(tutor.availability or '{}'),
                'hourly_rate': tutor.hourly_rate,
                'rating': tutor.rating,
                'total_sessions': tutor.total_sessions or 0,
                'verified': tutor.verified,
                'teaching_style': getattr(tutor, 'teaching_style', 'adaptive') or 'adaptive',
                'years_experience': getattr(tutor, 'years_experience', ''),
                'education': getattr(tutor, 'education', ''),
                'certifications': getattr(tutor, 'certifications', ''),
                'specializations': getattr(tutor, 'specializations', ''),
                'teaching_philosophy': getattr(tutor, 'teaching_philosophy', ''),
                'min_session_length': getattr(tutor, 'min_session_length', '30'),
                'max_students': getattr(tutor, 'max_students', ''),
                'preferred_age_groups': json.loads(
                    getattr(tutor, 'preferred_age_groups', '[]') or '[]'
                ),
                'gender': getattr(user, 'gender', ''),
            }
        }), 200
    except Exception as e:
        print(f"[TUTOR PROFILE] Error: {e}")
        return jsonify({'error': 'Failed to fetch tutor profile'}), 500

# Add this FIXED version to your app.py
# This version keeps your existing connect/disconnect handlers

# Replace ONLY the initiate_video_call handler

@socketio.on('initiate_video_call')
def handle_initiate_video_call_with_notification(data):
    """Handle video call initiation with FCM notification"""
    try:
        meeting_id = data.get('meetingId')
        caller_id = data.get('callerId')
        receiver_id = data.get('receiverId')
        caller_name = data.get('callerName')
        join_url = data.get('joinUrl')
        
        print(f"\n{'='*70}")
        print(f"📞 [VIDEO] Call initiated with notification")
        print(f"📞 [VIDEO] Caller: {caller_id} ({caller_name})")
        print(f"📞 [VIDEO] Receiver: {receiver_id}")
        print(f"{'='*70}")
        
        # Send Socket.IO event (for users currently online)
        receiver_sid = active_connections.get(receiver_id)
        
        if receiver_sid:
            emit('incoming_video_call', {
                'meetingId': meeting_id,
                'callerId': caller_id,
                'callerName': caller_name,
                'joinUrl': join_url
            }, room=receiver_sid)
            print(f"✅ [VIDEO] Socket notification sent")
        
        # ALWAYS send FCM notification (works even when app is closed)
        fcm_success = send_call_notification(
            caller_id=caller_id,
            receiver_id=receiver_id,
            meeting_id=meeting_id,
            join_url=join_url
        )
        
        if fcm_success:
            print(f"✅ [VIDEO] FCM notification sent")
        else:
            print(f"⚠️ [VIDEO] FCM notification failed (user may not have notifications enabled)")
        
        # Confirm to caller
        emit('call_initiated', {
            'meetingId': meeting_id,
            'status': 'sent',
            'fcm_sent': fcm_success
        }, room=request.sid)
        
    except Exception as e:
        print(f"❌ [VIDEO] Error: {e}")
        import traceback
        traceback.print_exc()
        emit('call_failed', {'error': str(e)}, room=request.sid)


# Update call_accepted handler
@socketio.on('call_accepted')
def handle_call_accepted(data):
    """Handle call acceptance - FIXED"""
    try:
        meeting_id = data.get('meetingId')
        accepted_by = data.get('acceptedBy')
        caller_id = data.get('callerId')  # Add this
        
        print(f"✅ [VIDEO] Call {meeting_id} accepted by: {accepted_by}")
        
        # Notify the caller
        if caller_id:
            caller_sid = active_connections.get(caller_id)
            if caller_sid:
                emit('call_accepted', {
                    'meetingId': meeting_id,
                    'acceptedBy': accepted_by
                }, room=caller_sid)
                print(f"✅ [VIDEO] Notified caller {caller_id}")
        else:
            # Fallback: broadcast to all
            emit('call_accepted', {
                'meetingId': meeting_id,
                'acceptedBy': accepted_by
            }, broadcast=True)
        
    except Exception as e:
        print(f"❌ [VIDEO] Error accepting call: {e}")


# Update call_declined handler
@socketio.on('call_declined')
def handle_call_declined(data):
    """Handle call decline - FIXED"""
    try:
        meeting_id = data.get('meetingId')
        declined_by = data.get('declinedBy')
        caller_id = data.get('callerId')  # Add this
        
        print(f"❌ [VIDEO] Call {meeting_id} declined by: {declined_by}")
        
        # Notify the caller
        if caller_id:
            caller_sid = active_connections.get(caller_id)
            if caller_sid:
                emit('call_declined', {
                    'meetingId': meeting_id,
                    'declinedBy': declined_by
                }, room=caller_sid)
                print(f"✅ [VIDEO] Notified caller {caller_id} of decline")
        else:
            # Fallback: broadcast to all
            emit('call_declined', {
                'meetingId': meeting_id,
                'declinedBy': declined_by
            }, broadcast=True)
        
    except Exception as e:
        print(f"❌ [VIDEO] Error declining call: {e}")


@socketio.on('end_video_call')
def handle_end_video_call(data):
    """Handle video call ending"""
    try:
        meeting_id = data.get('meetingId')
        ended_by = data.get('endedBy')
        other_user_id = data.get('otherUserId')
 
        print(f"🔴 [VIDEO] Call {meeting_id} ended by: {ended_by}")
 
        if other_user_id:
            other_sid = active_connections.get(other_user_id) or active_connections.get(str(other_user_id))
            if other_sid:
                emit('call_ended', {'meetingId': meeting_id, 'endedBy': ended_by}, room=other_sid)
                print(f"✅ [VIDEO] Notified other user {other_user_id}")
 
            # Remove the ringing notification on their phone (app open or closed)
            try:
                tokens = [t.token for t in FCMToken.query.filter_by(
                    user_id=int(other_user_id), is_active=True).all() if is_expo_token(t.token)]
                if tokens:
                    send_expo_push(tokens, 'Call ended', '', {'meetingId': meeting_id}, 'call_cancelled')
            except Exception as push_err:
                print(f"⚠️ [VIDEO] call_cancelled push failed: {push_err}")
        else:
            emit('call_ended', {'meetingId': meeting_id, 'endedBy': ended_by}, broadcast=True)
 
    except Exception as e:
        print(f"❌ [VIDEO] Error ending call: {e}")
# Add debug endpoint to check online users
@app.route('/api/socket/online-users', methods=['GET'])
def get_online_users():
    """Check which users are currently online"""
    return jsonify({
        'online_users': list(active_connections.keys()),
        'total': len(active_connections),
        'connections': {str(k): v for k, v in active_connections.items()}
    }), 200


# Add debug endpoint to test call notification
@app.route('/api/debug/test-call-notification/<int:receiver_id>', methods=['POST'])
@jwt_required()
def test_call_notification(receiver_id):
    """Test if we can send notification to a specific user"""
    try:
        caller_id = int(get_jwt_identity())
        
        receiver_sid = active_connections.get(receiver_id)
        
        if not receiver_sid:
            return jsonify({
                'success': False,
                'error': 'Receiver not online',
                'receiver_id': receiver_id,
                'online_users': list(active_connections.keys())
            }), 404
        
        # Send test notification directly to sid
        socketio.emit('test_notification', {
            'message': 'Test notification from API',
            'from': caller_id,
            'timestamp': datetime.utcnow().isoformat()
        }, room=receiver_sid)
        
        return jsonify({
            'success': True,
            'receiver_id': receiver_id,
            'receiver_sid': receiver_sid,
            'message': 'Test notification sent to receiver sid'
        }), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500
@app.route('/api/notifications/test', methods=['POST'])
@jwt_required()
def send_test_notification():
    """Send test notification to current user"""
    try:
        user_id_str = get_jwt_identity()
        user_id = int(user_id_str)
        
        data = request.get_json() or {}
        
        # Get target user (default to self)
        target_user_id = data.get('userId', user_id)
        
        print(f"\n{'='*70}")
        print(f"[TEST NOTIF] Sending test notification to user {target_user_id}")
        print(f"{'='*70}")
        
        # Send FCM notification
        success = send_fcm_notification(
            user_id=target_user_id,
            title=data.get('title', '🔔 Test Notification'),
            body=data.get('body', 'This is a test notification from EduConnect!'),
            data={
                'type': data.get('type', 'test'),
                'url': '/',
                'timestamp': datetime.utcnow().isoformat()
            },
            notification_type='test'
        )
        
        if success:
            print(f"✅ [TEST NOTIF] Notification sent successfully")
            return jsonify({
                'success': True,
                'message': 'Test notification sent successfully',
                'user_id': target_user_id
            }), 200
        else:
            print(f"❌ [TEST NOTIF] Failed to send notification")
            return jsonify({
                'success': False,
                'error': 'Failed to send notification. User may not have notifications enabled.'
            }), 500
            
    except Exception as e:
        print(f"❌ [TEST NOTIF] Error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


    
@socketio.on('connect')
def handle_connect(auth):
    """Handle client connection"""
    user_id = auth.get('userId') if auth else None
    
    if user_id:
        active_connections[user_id] = request.sid
        user_rooms[user_id] = []
        
        print(f"✅ [SOCKET] User {user_id} connected with sid {request.sid}")
        
        # Notify others that user is online
        emit('user_status', {
            'userId': user_id,
            'status': 'online'
        }, broadcast=True, include_self=False)
        
        # Send list of online users to newly connected user
        emit('users_online', list(active_connections.keys()))
    else:
        print(f"⚠️ [SOCKET] Connection without userId")
    
    return True


@socketio.on('disconnect')
def handle_disconnect():
    """Handle client disconnection"""
    sid = request.sid
    
    # Find user_id for this sid
    user_id = None
    for uid, s in active_connections.items():
        if s == sid:
            user_id = uid
            break
    
    if user_id:
        # Remove from active connections
        del active_connections[user_id]
        
        # Leave all rooms
        if user_id in user_rooms:
            for room in user_rooms[user_id]:
                leave_room(room)
            del user_rooms[user_id]
        
        print(f"❌ [SOCKET] User {user_id} disconnected")
        
        # Notify others that user is offline
        emit('user_status', {
            'userId': user_id,
            'status': 'offline'
        }, broadcast=True)

@socketio.on('send_message')
def handle_send_message_with_notification(data):
    """Handle message sending with FCM notification"""
    try:
        conversation_id = data.get('conversationId')
        sender_id = data.get('sender_id')
        receiver_id = data.get('receiver_id')
        text = data.get('text')
        timestamp = data.get('timestamp')
        message_id = data.get('messageId')
        file_url = data.get('file_url')
        file_type = data.get('file_type')
        file_name = data.get('file_name')
        
        print(f"📤 [MESSAGE] From {sender_id} to {receiver_id}")
        
        # Get or create conversation
        conversation = Conversation.query.filter(
            ((Conversation.participant1_id == sender_id) & (Conversation.participant2_id == receiver_id)) |
            ((Conversation.participant1_id == receiver_id) & (Conversation.participant2_id == sender_id))
        ).first()
        
        if not conversation:
            conversation = Conversation(
                participant1_id=sender_id,
                participant2_id=receiver_id,
                last_message=text,
                last_message_time=datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
            )
            db.session.add(conversation)
            db.session.flush()
        else:
            conversation.last_message = text
            conversation.last_message_time = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
        
        # Save message
        message = Message(
            conversation_id=conversation.id,
            sender_id=sender_id,
            text=text,
            timestamp=datetime.fromisoformat(timestamp.replace('Z', '+00:00')),
            file_url=file_url,
            file_type=file_type,
            file_name=file_name
        )
        db.session.add(message)
        db.session.commit()
        
        # Broadcast via Socket.IO (for online users)
        message_data = {
            'id': message.id,
            'conversationId': conversation_id,
            'sender_id': sender_id,
            'receiver_id': receiver_id,
            'text': text,
            'timestamp': timestamp,
            'status': 'delivered',
            'file_url': file_url,
            'file_type': file_type,
            'file_name': file_name
        }
        
        emit('receive_message', message_data, room=conversation_id)
        
        # Send FCM notification (for offline users or background tabs)
        send_message_notification(
            sender_id=sender_id,
            receiver_id=receiver_id,
            message_text=text or 'Sent a file',
            conversation_id=conversation.id
        )
        
        # Send delivery confirmation to sender
        emit('message_delivered', {
            'messageId': message_id,
            'dbMessageId': message.id,
            'status': 'delivered'
        }, room=request.sid)
        
    except Exception as e:
        print(f"❌ [MESSAGE] Error: {e}")
        import traceback
        traceback.print_exc()
        
        db.session.rollback()
        
        emit('message_error', {
            'error': str(e),
            'messageId': data.get('messageId')
        }, room=request.sid)

@socketio.on('join_conversation')
def handle_join_conversation(data):
    """Join a conversation room"""
    conversation_id = data.get('conversationId')
    user_id = data.get('userId')
    
    if conversation_id and user_id:
        join_room(conversation_id)
        
        if user_id not in user_rooms:
            user_rooms[user_id] = []
        
        if conversation_id not in user_rooms[user_id]:
            user_rooms[user_id].append(conversation_id)
        
        print(f"👥 [SOCKET] User {user_id} joined conversation {conversation_id}")
        
        emit('joined_conversation', {
            'conversationId': conversation_id,
            'userId': user_id
        }, room=conversation_id)


@socketio.on('leave_conversation')
def handle_leave_conversation(data):
    """Leave a conversation room"""
    conversation_id = data.get('conversationId')
    user_id = data.get('userId')
    
    if conversation_id and user_id:
        leave_room(conversation_id)
        
        if user_id in user_rooms and conversation_id in user_rooms[user_id]:
            user_rooms[user_id].remove(conversation_id)
        
        print(f"👋 [SOCKET] User {user_id} left conversation {conversation_id}")




@socketio.on('join_conversation')
def handle_join_conversation(data):
    """Join a conversation room - JOIN MULTIPLE ROOM FORMATS"""
    conversation_id = data.get('conversationId')
    user_id = data.get('userId')
    partner_id = data.get('partnerId')
    
    if conversation_id and user_id:
        # Join the main room
        join_room(conversation_id)
        print(f"👥 [SOCKET] User {user_id} joined room: {conversation_id}")
        
        # 🔥 FIX: Also join alternative formats for cross-compatibility
        if partner_id:
            alt_room_1 = f"conversation:{user_id}:{partner_id}"
            alt_room_2 = f"conversation:{partner_id}:{user_id}"
            
            join_room(alt_room_1)
            join_room(alt_room_2)
            
            print(f"👥 [SOCKET] User {user_id} also joined: {alt_room_1}, {alt_room_2}")
        else:
            print(f"⚠️ [SOCKET] No partnerId provided for user {user_id}")
        
        if user_id not in user_rooms:
            user_rooms[user_id] = []
        
        if conversation_id not in user_rooms[user_id]:
            user_rooms[user_id].append(conversation_id)
        
        # Log all rooms this user is in
        print(f"📋 [SOCKET] User {user_id} is now in rooms: {user_rooms.get(user_id, [])}")
        
        emit('joined_conversation', {
            'conversationId': conversation_id,
            'userId': user_id
        }, room=conversation_id)
@socketio.on('typing')
def handle_typing(data):
    """Handle typing indicators"""
    conversation_id = data.get('conversationId')
    user_id = data.get('userId')
    
    if conversation_id and user_id:
        # Broadcast to everyone in the room except sender
        emit('user_typing', {
            'userId': user_id,
            'conversationId': conversation_id
        }, room=conversation_id, include_self=False)


@socketio.on('stop_typing')
def handle_stop_typing(data):
    """Handle stop typing"""
    conversation_id = data.get('conversationId')
    user_id = data.get('userId')
    
    if conversation_id and user_id:
        emit('user_stopped_typing', {
            'userId': user_id,
            'conversationId': conversation_id
        }, room=conversation_id, include_self=False)


@socketio.on('mark_as_read')
def handle_mark_as_read(data):
    """Mark messages as read"""
    conversation_id = data.get('conversationId')
    user_id = data.get('userId')
    message_ids = data.get('messageIds', [])
    
    print(f"✓ [SOCKET] User {user_id} read messages in {conversation_id}")
    
    # Notify sender that messages were read
    emit('messages_read', {
        'conversationId': conversation_id,
        'userId': user_id,
        'messageIds': message_ids
    }, room=conversation_id, include_self=False)

@app.route('/api/video/test', methods=['POST', 'GET'])
def test_video_endpoint():
    """Test video endpoint - no JWT required"""
    try:
        print("\n" + "🧪"*35)
        print("🧪 VIDEO TEST ENDPOINT HIT")
        print("🧪"*35)
        
        if request.method == 'POST':
            data = request.get_json()
            print(f"📦 Received data: {data}")
        
        # Test imports
        try:
            import uuid
            test_uuid = str(uuid.uuid4())
            print(f"✅ uuid works: {test_uuid}")
        except Exception as e:
            print(f"❌ uuid failed: {e}")
            return jsonify({'error': 'uuid import failed', 'details': str(e)}), 500
        
        try:
            import urllib.parse
            test_encode = urllib.parse.quote("Test User")
            print(f"✅ urllib.parse works: {test_encode}")
        except Exception as e:
            print(f"❌ urllib.parse failed: {e}")
            return jsonify({'error': 'urllib.parse import failed', 'details': str(e)}), 500
        
        # Test URL generation
        meeting_id = str(uuid.uuid4())
        room_name = f"educonnect-test-{meeting_id}"
        jitsi_domain = 'meet.jit.si'
        
        test_url = f"https://{jitsi_domain}/{room_name}?displayName={urllib.parse.quote('Test User')}"
        
        print(f"✅ Test URL generated: {test_url}")
        print("🧪"*35 + "\n")
        
        return jsonify({
            'success': True,
            'message': 'Video endpoint test successful',
            'test_url': test_url,
            'meeting_id': meeting_id,
            'imports': {
                'uuid': 'OK',
                'urllib.parse': 'OK'
            }
        }), 200
        
    except Exception as e:
        print(f"\n❌ VIDEO TEST ERROR:")
        print(f"❌ {str(e)}")
        import traceback
        traceback.print_exc()
        print("🧪"*35 + "\n")
        
        return jsonify({
            'success': False,
            'error': str(e),
            'traceback': traceback.format_exc()
        }), 500


@app.route('/api/video/create-daily-room', methods=['POST'])
@jwt_required()
def create_daily_room():
    """Create Daily.co room"""
    try:
        data = request.get_json()
        
        # Create room via Daily API
        response = requests.post(
            'https://api.daily.co/v1/rooms',
            headers={
                'Content-Type': 'application/json',
                'Authorization': f'Bearer {DAILY_API_KEY}'
            },
            json={
                'properties': {
                    'max_participants': data.get('maxParticipants', 15),
                    'enable_screenshare': True,
                    'enable_chat': True,
                    'enable_knocking': False,
                    'start_video_off': False,
                    'start_audio_off': False
                }
            }
        )
        
        if response.status_code != 200:
            raise Exception('Failed to create Daily room')
        
        room_data = response.json()
        
        return jsonify({
            'success': True,
            'roomUrl': room_data['url'],
            'roomName': room_data['name']
        }), 200
        
    except Exception as e:
        print(f'❌ [DAILY] Error: {e}')
        return jsonify({'error': str(e)}), 500
@app.route('/api/health', methods=['GET'])
def health_check():
    """Basic health check - NO AUTH REQUIRED"""
    return jsonify({
        'status': 'online',
        'message': 'Server is running',
        'routes_loaded': True
    }), 200





@app.route('/api/debug/routes', methods=['GET'])
def list_all_routes():
    """List all registered Flask routes"""
    routes = []
    for rule in app.url_map.iter_rules():
        routes.append({
            'endpoint': rule.endpoint,
            'methods': list(rule.methods),
            'path': str(rule)
        })
    
    # Sort by path
    routes.sort(key=lambda x: x['path'])
    
    return jsonify({
        'total_routes': len(routes),
        'routes': routes
    }), 200


def generate_jitsi_jwt(room_name, user_name, user_email, moderator=False):
    """
    Generate JWT token for Jitsi authentication
    Note: For production, you should use a proper JWT library and your own Jitsi server
    """
    import jwt as pyjwt
    from datetime import datetime, timedelta
    
    # Your Jitsi app credentials (get these from your Jitsi server config)
    # For meet.jit.si, JWT is optional. For self-hosted, you need to configure this.
    APP_ID = os.getenv('JITSI_APP_ID', 'educonnect')
    APP_SECRET = os.getenv('JITSI_APP_SECRET', 'your-secret-key')
    
    # JWT payload
    payload = {
        'context': {
            'user': {
                'name': user_name,
                'email': user_email,
                'moderator': moderator
            }
        },
        'aud': APP_ID,
        'iss': APP_ID,
        'sub': 'meet.jit.si',  # or your Jitsi domain
        'room': room_name,
        'exp': datetime.utcnow() + timedelta(hours=2),  # Token expires in 2 hours
        'nbf': datetime.utcnow() - timedelta(minutes=5)
    }
    
    # Generate JWT
    token = pyjwt.encode(payload, APP_SECRET, algorithm='HS256')
    
    return token
# ============================================================================
# HEALTH CHECK FOR SOCKET.IO
# ============================================================================

@app.route('/api/socket/status', methods=['GET'])
def socket_status():
    """Check Socket.IO server status"""
    return jsonify({
        'status': 'online',
        'active_connections': len(active_connections),
        'online_users': list(active_connections.keys()),
        'user_rooms': {str(k): v for k, v in user_rooms.items()},
        'protocol': 'Socket.IO'
    }), 200

# -------------------- ROUTES --------------------
@app.route('/api/student/profile', methods=['PUT'])
@jwt_required()
def update_student_profile_enhanced():
    """Update enhanced student profile"""
    print("\n📝 [PROFILE UPDATE] Updating student profile")
    
    user_id_str = get_jwt_identity()
    user_id = int(user_id_str)
    user = User.query.get(user_id)
    
    if not user or user.user_type != 'student':
        return jsonify({'error': 'Not authorized'}), 403
    
    data = request.json
    
    profile = user.student_profile
    if not profile:
        profile = StudentProfile(user_id=user.id)
        db.session.add(profile)
        db.session.flush()
    
    # Update all fields
    if 'learning_style' in data:
        profile.learning_style = data['learning_style']
    if 'preferred_subjects' in data:
        profile.preferred_subjects = json.dumps(data['preferred_subjects'])
    if 'skill_level' in data:
        profile.skill_level = data['skill_level']
    if 'learning_goals' in data:
        profile.learning_goals = data['learning_goals']
    if 'available_time' in data:
        profile.available_time = data['available_time']
    if 'preferred_languages' in data:
        profile.preferred_languages = json.dumps(data['preferred_languages'])
    
    # Skills
    if 'math_score' in data:
        profile.math_score = int(data['math_score'])
    if 'science_score' in data:
        profile.science_score = int(data['science_score'])
    if 'language_score' in data:
        profile.language_score = int(data['language_score'])
    if 'tech_score' in data:
        profile.tech_score = int(data['tech_score'])
    if 'motivation_level' in data:
        profile.motivation_level = int(data['motivation_level'])
    
    # Additional fields (add these columns to StudentProfile model)
    if 'bio' in data:
        profile.bio = data['bio']
    if 'weekly_study_hours' in data:
        profile.weekly_study_hours = data['weekly_study_hours']
    if 'preferred_session_length' in data:
        profile.preferred_session_length = data['preferred_session_length']
    if 'learning_pace' in data:
        profile.learning_pace = data['learning_pace']
    if 'tutor_gender_preference' in data:
        profile.tutor_gender_preference = data['tutor_gender_preference']
    if 'selected_goals' in data:
        profile.selected_goals = json.dumps(data['selected_goals'])
    db.session.commit()
    
    print("✅ [PROFILE UPDATE] Profile updated successfully")
    
    return jsonify({'message': 'Profile updated successfully'}), 200

@app.route('/api/auth/register', methods=['POST', 'OPTIONS'])
def register_with_verification():
    """Fixed registration endpoint"""
    
    if request.method == 'OPTIONS':
        return '', 200
    
    try:
        data = request.json
        
        print(f"\n{'='*70}")
        print(f"[REGISTER] Registration attempt")
        print(f"[REGISTER] Email: {data.get('email')}")
        print(f"[REGISTER] Name: {data.get('name')}")
        print(f"[REGISTER] Role: {data.get('role')}")
        print(f"{'='*70}")
        
        # Validate input
        if not data.get('email') or not data.get('password') or not data.get('name'):
            print("[REGISTER] Missing required fields")
            return jsonify({'error': 'Missing required fields'}), 400
        
        # Check if user exists
        existing_user = User.query.filter_by(email=data['email']).first()
        if existing_user:
            print(f"[REGISTER] User already exists: {data['email']}")
            return jsonify({'error': 'User already exists'}), 400
        
        # Validate password strength
        password = data['password']
        if len(password) < 8:
            print("[REGISTER] Password too short")
            return jsonify({'error': 'Password must be at least 8 characters'}), 400
        
        # Create new user
        hashed_password = bcrypt.generate_password_hash(password).decode('utf-8')
        
        new_user = User(
            email=data['email'],
            password_hash=hashed_password,
            full_name=data['name'],
            user_type=data.get('role', 'student'),
            email_verified=True,  # Auto-verify for now
            failed_login_attempts=0
        )
        
        db.session.add(new_user)
        db.session.flush()  # Get the user ID before committing
        
        print(f"[REGISTER] User created with ID: {new_user.id}")
        
        # Create profile based on user type
        if new_user.user_type == 'tutor':
            print("[REGISTER] Creating tutor profile")
            tutor_profile = TutorProfile(
                user_id=new_user.id,
                expertise=json.dumps([]),
                languages=json.dumps(['English']),
                availability=json.dumps({}),
                verified=False
            )
            db.session.add(tutor_profile)
        elif new_user.user_type == 'student':
            print("[REGISTER] Creating student profile")
            student_profile = StudentProfile(
                user_id=new_user.id,
                survey_completed=False
            )
            db.session.add(student_profile)
        
        # ✅ COMMIT BEFORE trying to send email
        db.session.commit()
        
        print(f"✅ [REGISTER] User {new_user.id} registered successfully")
        
        # Try to send verification email (but don't fail if it doesn't work)
        email_sent = False
        try:
            token = serializer.dumps(new_user.email, salt=app.config['SECURITY_PASSWORD_SALT'])
            frontend_url = os.getenv('FRONTEND_URL', 'http://localhost:3000')
            verification_url = f"{frontend_url}/verify-email?token={token}"
            
            # Try to send email (you'd need to implement send_verification_email)
            # email_sent = send_verification_email(new_user.email, verification_url)
            print(f"[REGISTER] Verification URL: {verification_url}")
        except Exception as email_error:
            print(f"⚠️ [REGISTER] Email sending failed (non-critical): {email_error}")
        
        print(f"{'='*70}\n")
        
        return jsonify({
            'message': 'Registration successful! You can now log in.',
            'email': new_user.email,
            'user_id': new_user.id,
            'email_sent': email_sent
        }), 201
        
    except Exception as e:
        db.session.rollback()
        print(f"\n❌ [REGISTER ERROR] Exception: {str(e)}")
        import traceback
        print(traceback.format_exc())
        print(f"{'='*70}\n")
        return jsonify({'error': 'Registration failed', 'details': str(e)}), 500
    
    
def generate_verification_token(email):
    """Generate email verification token"""
    return serializer.dumps(email, salt=app.config['SECURITY_PASSWORD_SALT'])
"""
 @app.route('/api/auth/verify-email', methods=['GET'])
def verify_email():
    
    try:
        token = request.args.get('token')
        
        if not token:
            return jsonify({'error': 'Verification token is required'}), 400
        
        # Verify token (1 hour expiration)
        email = verify_token(token, expiration=3600)
        
        if not email:
            return jsonify({'error': 'Invalid or expired verification link'}), 400
        
        # Find user
        user = User.query.filter_by(email=email).first()
        
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        if user.email_verified:
            return jsonify({'message': 'Email already verified'}), 200
        
        # Mark as verified
        user.email_verified = True
        db.session.commit()
        
        print(f"✅ [VERIFY] Email verified for user {user.id}")
        
        return jsonify({
            'message': 'Email verified successfully! You can now log in.',
            'email': user.email
        }), 200
        
    except Exception as e:
        print(f"[VERIFY ERROR] {str(e)}")
        return jsonify({'error': 'Verification failed'}), 500


@app.route('/api/auth/resend-verification', methods=['POST'])
def resend_verification():
    
    try:
        data = request.json
        email = data.get('email')
        
        if not email:
            return jsonify({'error': 'Email is required'}), 400
        
        user = User.query.filter_by(email=email).first()
        
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        if user.email_verified:
            return jsonify({'message': 'Email already verified'}), 200
        
        # Generate new token
        token = generate_verification_token(user.email)
        verification_url = f"{request.host_url}verify-email?token={token}"
        
        # Send email
        email_sent = send_verification_email(user.email, verification_url)
        
        if email_sent:
            return jsonify({'message': 'Verification email sent successfully'}), 200
        else:
            return jsonify({'error': 'Failed to send email'}), 500
            
    except Exception as e:
        print(f"[RESEND ERROR] {str(e)}")
        return jsonify({'error': 'Failed to resend verification'}), 500

"""

# Add this new endpoint around line 1500 (after other message endpoints)

# Add this near the top of your app.py, after app initialization

# Configure static file serving for attachments
@app.route('/uploads/<path:filename>', methods=['GET'])
def serve_uploaded_file(filename):
    """Serve uploaded files directly"""
    try:
        # Construct the full path
        upload_folder = app.config['UPLOAD_FOLDER']
        file_path = os.path.join(upload_folder, filename)
        
        # Check if file exists
        if not os.path.exists(file_path):
            print(f"❌ File not found: {file_path}")
            return jsonify({'error': 'File not found'}), 404
        
        # Serve the file
        return send_file(file_path)
    except Exception as e:
        print(f"❌ Error serving file: {e}")
        return jsonify({'error': 'Failed to serve file'}), 500


# Update the upload endpoint (around line 1500)

@app.route('/api/messages/upload', methods=['POST'])
@jwt_required()
def upload_message_attachment():
    """Upload file attachment to Cloudinary"""
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        
        file = request.files['file']
        conversation_id = request.form.get('conversation_id')
        
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        # Validate file size (10MB max)
        file.seek(0, os.SEEK_END)
        file_size = file.tell()
        file.seek(0)
        
        if file_size > 10 * 1024 * 1024:
            return jsonify({'error': 'File too large (max 10MB)'}), 400
        
        print(f"[UPLOAD] 📤 Uploading to Cloudinary: {file.filename}")
        
        # Determine resource type
        is_video = file.mimetype.startswith('video/')
        is_audio = file.mimetype.startswith('audio/')
        resource_type = 'video' if (is_video or is_audio) else 'image'
        
        # Upload to Cloudinary
        upload_result = cloudinary.uploader.upload(
            file,
            resource_type=resource_type,
            folder='chat-attachments',
            public_id=f"{conversation_id}_{datetime.utcnow().timestamp()}_{secure_filename(file.filename)}"
        )
        
        file_url = upload_result['secure_url']
        
        print(f"[UPLOAD] ✅ Uploaded to Cloudinary: {file_url}")
        
        # Determine file type
        file_type = 'image' if file.mimetype.startswith('image/') else \
                   'voice' if file.mimetype.startswith('audio/') else 'file'
        
        return jsonify({
            'file_url': file_url,
            'file_name': file.filename,
            'file_size': file_size,
            'file_type': file_type
        }), 200
        
    except Exception as e:
        print(f"[UPLOAD ERROR] ❌ {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Upload failed', 'details': str(e)}), 500

# Update the serve_attachment endpoint (replace existing one)
@app.route('/api/attachments/<filename>', methods=['GET'])
def serve_attachment(filename):
    """Serve uploaded attachment (alternative endpoint)"""
    try:
        attachments_dir = os.path.join(app.config['UPLOAD_FOLDER'], 'attachments')
        file_path = os.path.join(attachments_dir, filename)
        
        if not os.path.exists(file_path):
            return jsonify({'error': 'File not found'}), 404
            
        return send_file(file_path)
    except Exception as e:
        print(f"❌ Error serving attachment: {e}")
        return jsonify({'error': 'File not found'}), 404


@app.route('/api/auth/login', methods=['POST', 'OPTIONS'])
def login():
    """Fixed login endpoint"""
    
    if request.method == 'OPTIONS':
        return '', 200
    
    try:
        data = request.json
        
        print(f"\n{'='*70}")
        print(f"[LOGIN] Login attempt")
        print(f"[LOGIN] Email: {data.get('email')}")
        print(f"{'='*70}")
        
        # Validate input
        if not data or not data.get('email') or not data.get('password'):
            print("[LOGIN] Missing email or password")
            return jsonify({'error': 'Email and password are required'}), 400
        
        # Find user
        user = User.query.filter_by(email=data['email']).first()
        
        if not user:
            print("[LOGIN] User not found")
            return jsonify({'error': 'Invalid credentials'}), 401
        
        print(f"[LOGIN] User found: {user.id}")
        
        # Check password
        if not bcrypt.check_password_hash(user.password_hash, data['password']):
            print("[LOGIN] Invalid password")
            return jsonify({'error': 'Invalid credentials'}), 401
        
        print(f"[LOGIN] Password correct")
        
        # TEMPORARILY SKIP EMAIL VERIFICATION CHECK FOR TESTING
        # Comment this out if you want to enforce email verification
        # if not user.email_verified:
        #     print(f"[LOGIN] Email not verified")
        #     return jsonify({
        #         'error': 'Please verify your email before logging in',
        #         'email_verified': False
        #     }), 403
        
        # Generate token
        access_token = create_access_token(identity=str(user.id))
        
        print(f"[LOGIN] Token generated")
        
        # Build user data
        user_data = {
            'id': user.id,
            'email': user.email,
            'user_type': user.user_type,
            'full_name': user.full_name,
            'email_verified': user.email_verified
        }
        
        # Handle tutor profile
        if user.user_type == 'tutor':
            db.session.expire_all()
            tutor_profile = TutorProfile.query.filter_by(user_id=user.id).first()
            
            if tutor_profile:
                is_complete = tutor_profile.verified in [True, 1]
                user_data['tutor_profile_id'] = tutor_profile.id
                user_data['profile_complete'] = is_complete
                print(f"[LOGIN] Tutor profile found: {tutor_profile.id}, complete: {is_complete}")
            else:
                user_data['tutor_profile_id'] = None
                user_data['profile_complete'] = False
                print(f"[LOGIN] No tutor profile found")
        else:
            user_data['profile_complete'] = True
        
        print(f"[LOGIN] ✅ Login successful for user {user.id}")
        print(f"{'='*70}\n")
        
        return jsonify({
            'token': access_token,
            'user': user_data,
            'message': 'Login successful'
        }), 200
        
    except Exception as e:
        print(f"\n❌ [LOGIN ERROR] Exception: {str(e)}")
        import traceback
        print(traceback.format_exc())
        print(f"{'='*70}\n")
        return jsonify({'error': 'Login failed', 'details': str(e)}), 500

@app.route('/api/auth/logout', methods=['POST'])
@jwt_required()
def secure_logout():
    """Secure logout endpoint"""
    try:
        user_id_str = get_jwt_identity()
        user_id = int(user_id_str)
        
        print(f"✅ [LOGOUT] User {user_id} logged out successfully")
        
        # Note: With JWT, we can't actually invalidate the token server-side
        # unless we implement a token blacklist. The frontend should clear
        # the token from localStorage.
        
        return jsonify({
            'message': 'Logout successful',
            'user_id': user_id
        }), 200
        
    except Exception as e:
        print(f"[LOGOUT ERROR] {str(e)}")
        return jsonify({'error': 'Logout failed'}), 500


@app.route('/api/auth/forgot-password', methods=['POST'])
def forgot_password():
    """Request password reset"""
    try:
        data = request.json
        email = data.get('email')
        
        if not email:
            return jsonify({'error': 'Email is required'}), 400
        
        user = User.query.filter_by(email=email).first()
        
        # Always return success to prevent email enumeration
        if not user:
            return jsonify({
                'message': 'If an account exists with this email, you will receive password reset instructions.'
            }), 200
        
        # Generate reset token
        token = generate_verification_token(user.email)
        
        # Store token in database (optional, for tracking)
        user.reset_password_token = token
        user.reset_password_expires = datetime.utcnow() + timedelta(hours=1)
        db.session.commit()
        
        # Create reset URL
        reset_url = f"{request.host_url}reset-password?token={token}"
        
        # Send email
        email_sent = send_password_reset_email(user.email, reset_url)
        
        return jsonify({
            'message': 'If an account exists with this email, you will receive password reset instructions.',
            'email_sent': email_sent
        }), 200
        
    except Exception as e:
        print(f"[FORGOT PASSWORD ERROR] {str(e)}")
        return jsonify({'error': 'Failed to process request'}), 500


@app.route('/api/auth/reset-password', methods=['POST'])
def reset_password():
    """Reset password with token"""
    try:
        data = request.json
        token = data.get('token')
        new_password = data.get('password')
        
        if not token or not new_password:
            return jsonify({'error': 'Token and new password are required'}), 400
        
        # Validate password strength
        if len(new_password) < 8:
            return jsonify({'error': 'Password must be at least 8 characters'}), 400
        
        # Verify token
        email = verify_token(token, expiration=3600)
        
        if not email:
            return jsonify({'error': 'Invalid or expired reset link'}), 400
        
        # Find user
        user = User.query.filter_by(email=email).first()
        
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        # Update password
        user.password_hash = bcrypt.generate_password_hash(new_password).decode('utf-8')
        user.reset_password_token = None
        user.reset_password_expires = None
        user.failed_login_attempts = 0  # Reset failed attempts
        user.account_locked_until = None  # Unlock if locked
        
        db.session.commit()
        
        print(f"✅ [PASSWORD RESET] Password reset for user {user.id}")
        
        return jsonify({
            'message': 'Password reset successfully. You can now log in with your new password.'
        }), 200
        
    except Exception as e:
        db.session.rollback()
        print(f"[RESET PASSWORD ERROR] {str(e)}")
        return jsonify({'error': 'Failed to reset password'}), 500


@app.route('/api/auth/change-password', methods=['POST'])
@jwt_required()  # or your auth decorator
def change_password():
    
    data = request.get_json()
   
    print("🔍 Incoming JSON:", data)
    current_password = data.get('currentPassword')
    new_password = data.get('newPassword')

    if not current_password or not new_password:
        return jsonify({'error': 'Missing password fields'}), 400

    # Get current user (adjust to your auth setup)
    user_id = get_jwt_identity()  # assuming flask_jwt_extended
    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': 'User not found'}), 404

    # Check current password
    if not check_password_hash(user.password_hash, current_password):
        return jsonify({'error': 'Current password is incorrect'}), 400
    print("Before:", user.password_hash)
    # Hash and save new password
    user = User.query.get(user_id)
    user.password_hash = generate_password_hash(new_password)
    print("After:", user.password_hash)
    db.session.commit()
    user_from_db = User.query.get(user_id)
    print("Reloaded:", user_from_db.password_hash)


    return jsonify({'message': 'Password changed successfully'}), 200
@app.route('/api/user/delete-account', methods=['DELETE', 'OPTIONS'])
@jwt_required()
def delete_account():
    """Delete user account and all associated data"""
    
    if request.method == 'OPTIONS':
        return '', 200
    
    try:
        user_id_str = get_jwt_identity()
        user_id = int(user_id_str)
        user = User.query.get(user_id)
        
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        print(f"\n{'='*70}")
        print(f"[DELETE ACCOUNT] User {user_id} ({user.full_name}) requesting account deletion")
        print(f"[DELETE ACCOUNT] User type: {user.user_type}")
        print(f"{'='*70}")
        
        # Delete user (cascade will handle related data)
        db.session.delete(user)
        db.session.commit()
        
        print(f"✅ [DELETE ACCOUNT] User {user_id} deleted successfully")
        print(f"{'='*70}\n")
        
        return jsonify({
            'message': 'Account deleted successfully',
            'user_id': user_id
        }), 200
        
    except Exception as e:
        db.session.rollback()
        print(f"❌ [DELETE ACCOUNT ERROR] {str(e)}")
        import traceback
        print(traceback.format_exc())
        return jsonify({'error': 'Failed to delete account'}), 500
@app.route('/api/enrollments/<int:enrollment_id>/progress', methods=['PUT'])
@jwt_required()
def update_enrollment_progress(enrollment_id):
    """Update student's course progress"""
    try:
        user_id_str = get_jwt_identity()
        user_id = int(user_id_str)
        user = User.query.get(user_id)
        
        if not user or user.user_type != 'student':
            return jsonify({'error': 'Only students can update progress'}), 403
        
        enrollment = Enrollment.query.get(enrollment_id)
        
        if not enrollment:
            return jsonify({'error': 'Enrollment not found'}), 404
        
        # Check ownership
        if enrollment.student_id != user_id:
            return jsonify({'error': 'Not authorized'}), 403
        
        data = request.get_json()
        new_progress = float(data.get('progress', 0))
        
        # Validate progress
        if new_progress < 0 or new_progress > 100:
            return jsonify({'error': 'Progress must be between 0 and 100'}), 400
        
        enrollment.progress = new_progress
        
        # Mark as completed if progress is 100%
        if new_progress >= 100:
            enrollment.completed = True
        
        db.session.commit()
        
        return jsonify({
            'message': 'Progress updated successfully',
            'progress': enrollment.progress,
            'completed': enrollment.completed
        }), 200
        
    except ValueError as e:
        return jsonify({'error': f'Invalid progress value: {str(e)}'}), 400
    except Exception as e:
        db.session.rollback()
        print(f"[PROGRESS ERROR] {str(e)}")
        import traceback
        print(traceback.format_exc())
        return jsonify({'error': 'Failed to update progress'}), 500


@app.route('/api/student/enrollments', methods=['GET'])
@jwt_required()
def get_student_enrollments():
    """Get student's enrolled courses with offline availability info"""
    user_id_str = get_jwt_identity()
    user_id = int(user_id_str)
    user = User.query.get(user_id)
    
    if not user or user.user_type != 'student':
        return jsonify({'error': 'Not authorized'}), 403
    
    enrollments = Enrollment.query.filter_by(student_id=user_id).all()
    
    enrollments_list = []
    for enrollment in enrollments:
        course = enrollment.course
        tutor_name = course.tutor.user.full_name if course.tutor else 'Unknown'
        
        enrollments_list.append({
            'id': enrollment.id,
            'course_id': course.id,
            'course_title': course.title,
            'category': course.category,     # add this
            'description': course.description,
            'tutor_name': tutor_name,
            'progress': enrollment.progress,
            'completed': enrollment.completed,
            'offline_available': course.offline_available,  # Add this field
            'enrolled_at': enrollment.enrolled_at.isoformat()
        })
    
    return jsonify({'enrollments': enrollments_list}), 200
@app.route('/api/tutor/stats', methods=['GET'])
@jwt_required()
def get_tutor_stats():
    """Get tutor statistics for dashboard"""
    try:
        user_id_str = get_jwt_identity()
        user_id = int(user_id_str)
        user = User.query.get(user_id)
        
        if not user or user.user_type != 'tutor':
            return jsonify({'error': 'Only tutors can access stats'}), 403
        
        tutor_profile = user.tutor_profile
        if not tutor_profile:
            return jsonify({
                'totalCourses': 0,
                'totalStudents': 0,
                'totalMessages': 0
            }), 200
        
        # Get course count
        course_count = Course.query.filter_by(tutor_id=tutor_profile.id).count()
        
        # Get total students across all courses
        courses = Course.query.filter_by(tutor_id=tutor_profile.id).all()
        total_students = sum(course.total_students for course in courses)
        
        # Get message count (conversations where tutor is participant)
        message_count = Conversation.query.filter(
            (Conversation.participant1_id == user_id) | 
            (Conversation.participant2_id == user_id)
        ).count()
        
        return jsonify({
            'totalCourses': course_count,
            'totalStudents': total_students,
            'totalMessages': message_count
        }), 200
        
    except Exception as e:
        print(f"[STATS ERROR] {str(e)}")
        import traceback
        print(traceback.format_exc())
        return jsonify({'error': 'Failed to get stats'}), 500

# ============================================================================
# TUTOR MESSAGING ROUTES
# ============================================================================
@app.route('/api/conversations/<int:conversation_id>/messages', methods=['GET'])
def get_conversation_messages_from_db(conversation_id):
    """Get message history from database - FIXED VERSION"""
    try:
        print(f"\n[MESSAGES] Fetching messages for conversation {conversation_id}")
        
        conversation = Conversation.query.get(conversation_id)
        
        if not conversation:
            print(f"[MESSAGES] Conversation {conversation_id} not found")
            return jsonify({'error': 'Conversation not found'}), 404
        
        messages = Message.query.filter_by(
            conversation_id=conversation_id
        ).order_by(Message.timestamp.asc()).all()
        
        print(f"[MESSAGES] Found {len(messages)} messages in database")
        
        messages_list = []
        for msg in messages:
            message_data = {
                'id': msg.id,
                'sender_id': msg.sender_id,
                'text': msg.text or '',
                'timestamp': msg.timestamp.isoformat() if msg.timestamp else None,
                'conversation_id': msg.conversation_id,
                'file_url': msg.file_url,      # ✅ ALWAYS include
                'file_type': msg.file_type,    # ✅ ALWAYS include
                'file_name': msg.file_name     # ✅ ALWAYS include
            }
            
            if msg.file_url:
                print(f"[MESSAGES] Message {msg.id} has file: {msg.file_type} - {msg.file_name}")
            
            messages_list.append(message_data)
        
        return jsonify({
            'messages': messages_list,
            'total': len(messages_list)
        }), 200
        
    except Exception as e:
        print(f"[ERROR] Failed to get messages: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'error': 'Failed to retrieve messages',
            'details': str(e)
        }), 500


@app.route('/api/tutors/<int:tutor_id>/conversations', methods=['GET', 'OPTIONS'])
def get_tutor_conversations(tutor_id):
    """Get all conversations for a tutor from database"""
    
    if request.method == 'OPTIONS':
        return '', 200
    
    try:
        print(f"\n[TUTOR CONV] Fetching conversations for tutor {tutor_id}")
        
        tutor_profile = TutorProfile.query.get(tutor_id)
        
        if not tutor_profile:
            return jsonify({'error': 'Tutor not found'}), 404
        
        user_id = tutor_profile.user_id
        
        # Get all conversations from database
        conversations = Conversation.query.filter(
            (Conversation.participant1_id == user_id) | 
            (Conversation.participant2_id == user_id)
        ).order_by(Conversation.last_message_time.desc()).all()
        
        print(f"[TUTOR CONV] Found {len(conversations)} conversations in database")
        
        result = []
        for conv in conversations:
            # Determine partner (student)
            partner_id = conv.participant2_id if conv.participant1_id == user_id else conv.participant1_id
            partner = User.query.get(partner_id)
            
            if partner:
                # Count unread messages (optional)
                unread_count = 0
                
                result.append({
                    'id': conv.id,
                    'partnerId': partner.id,
                    'studentId': partner.id,  # ✅ Add this field for compatibility
                    'partnerName': partner.full_name,
                    'studentName': partner.full_name,  # ✅ Add this field for compatibility
                    'partnerAvatar': f'https://ui-avatars.com/api/?name={partner.full_name}',
                    'lastMessage': conv.last_message or '',
                    'lastMessageTime': conv.last_message_time.isoformat() if conv.last_message_time else None,
                    'unreadCount': unread_count
                })
                
                print(f"[TUTOR CONV] Added conversation with {partner.full_name} (ID: {partner.id})")
        
        return jsonify(result), 200
        
    except Exception as e:
        print(f"❌ [TUTOR CONV ERROR] {str(e)}")
        import traceback
        print(traceback.format_exc())
        return jsonify({'error': 'Failed to retrieve conversations'}), 500


@app.route('/api/students/<int:student_id>/conversations', methods=['GET'])
def get_student_conversations(student_id):
    """Get all conversations for a student from database"""
    try:
        user = User.query.get(student_id)
        
        if not user:
            return jsonify({'error': 'Student not found'}), 404
        
        conversations = Conversation.query.filter(
            (Conversation.participant1_id == student_id) | 
            (Conversation.participant2_id == student_id)
        ).order_by(Conversation.last_message_time.desc()).all()
        
        result = []
        for conv in conversations:
            partner_id = conv.participant2_id if conv.participant1_id == student_id else conv.participant1_id
            partner = User.query.get(partner_id)
            
            if partner:
                result.append({
                    'id': conv.id,
                    'partnerId': partner.id,
                    'partnerName': partner.full_name,
                    'partnerAvatar': f'https://ui-avatars.com/api/?name={partner.full_name}',
                    'lastMessage': conv.last_message or '',
                    'lastMessageTime': conv.last_message_time.isoformat() if conv.last_message_time else None
                })
        
        return jsonify(result), 200
        
    except Exception as e:
        print(f"[ERROR] {str(e)}")
        return jsonify({'error': 'Failed to retrieve conversations'}), 500



# ============================================================================
# AUTHENTICATION ROUTES
# ============================================================================



@app.route('/api/tutor/onboarding', methods=['POST', 'OPTIONS'])
@jwt_required()
def complete_tutor_onboarding():
    """Complete tutor onboarding and save profile"""
    
    if request.method == 'OPTIONS':
        return '', 200
    
    try:
        print("\n" + "="*70)
        print("[ONBOARDING] Tutor onboarding endpoint hit")
        print("="*70)
        
        user_id_str = get_jwt_identity()
        user_id = int(user_id_str)
        user = User.query.get(user_id)
        
        if not user or user.user_type != 'tutor':
            return jsonify({'error': 'Only tutors can complete onboarding'}), 403
        
        data = request.get_json()
        print(f"[ONBOARDING] Received data: {json.dumps(data, indent=2)}")
        
        profile = user.tutor_profile
        if not profile:
            print("[ONBOARDING] ERROR: No tutor profile found!")
            return jsonify({'error': 'Tutor profile not found. Please contact support.'}), 404
        
        print(f"[ONBOARDING] Found profile {profile.id}")
        print(f"[ONBOARDING] BEFORE - verified: {profile.verified}")
        
        # Update profile fields
        if 'expertise' in data:
            profile.expertise = json.dumps(data['expertise'])
            print(f"[ONBOARDING] Updated expertise")
        if 'bio' in data:
            profile.bio = data['bio']
            print(f"[ONBOARDING] Updated bio")
        if 'hourlyRate' in data or 'hourly_rate' in data:
            profile.hourly_rate = float(data.get('hourlyRate') or data.get('hourly_rate', 0))
            print(f"[ONBOARDING] Updated hourly_rate: {profile.hourly_rate}")
        if 'languages' in data:
            profile.languages = json.dumps(data['languages'])
            print(f"[ONBOARDING] Updated languages")
        if 'availability' in data:
            profile.availability = json.dumps(data['availability'])
            print(f"[ONBOARDING] Updated availability")
        if 'gender' in data:
            user.gender = data['gender']
        # ✅ CRITICAL: Set verified to True
        profile.verified = True
        print(f"[ONBOARDING] Set verified = True")
        
        # ✅ Flush to apply changes
        db.session.flush()
        print(f"[ONBOARDING] After flush - verified: {profile.verified}")
        
        # ✅ Commit transaction
        db.session.commit()
        print(f"[ONBOARDING] ✅ Committed successfully")
        
        # ✅ Refresh to verify
        db.session.refresh(profile)
        print(f"[ONBOARDING] After refresh - verified: {profile.verified}")
        
        # ✅ Double-check by querying fresh
        check = TutorProfile.query.get(profile.id)
        print(f"[ONBOARDING] Fresh query - verified: {check.verified}")
        
        if not check.verified:
            print("[ONBOARDING] ❌ WARNING: Verified is still False after commit!")
            # Try one more time
            check.verified = True
            db.session.commit()
            db.session.refresh(check)
            print(f"[ONBOARDING] After retry - verified: {check.verified}")
        
        print(f"✅ [ONBOARDING] Profile completed! ID: {profile.id}")
        
        return jsonify({
            'message': 'Onboarding completed successfully',
            'tutor_profile_id': profile.id,
            'profile_complete': True,
            'verified': check.verified,
            'profile': {
                'id': profile.id,
                'expertise': json.loads(profile.expertise or '[]'),
                'bio': profile.bio,
                'hourly_rate': profile.hourly_rate,
                'verified': check.verified
            }
        }), 200
        
    except Exception as e:
        db.session.rollback()
        print(f"❌ [ONBOARDING ERROR] {str(e)}")
        import traceback
        print(traceback.format_exc())
        return jsonify({'error': 'Failed to complete onboarding', 'details': str(e)}), 500
# ============================================================================
# UPDATED LOGIN - Check profile completion status
# ============================================================================
@app.route('/api/debug/fix-profile/<int:profile_id>', methods=['POST'])
def fix_profile(profile_id):
    """Manually set verified to True for testing"""
    try:
        profile = TutorProfile.query.get(profile_id)
        if not profile:
            return jsonify({'error': 'Profile not found'}), 404
        
        print(f"[DEBUG] BEFORE - verified: {profile.verified}")
        profile.verified = True
        db.session.commit()
        db.session.refresh(profile)
        print(f"[DEBUG] AFTER - verified: {profile.verified}")
        
        return jsonify({
            'message': 'Profile updated',
            'profile_id': profile.id,
            'verified': profile.verified
        }), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500
    
@app.route('/api/login', methods=['POST', 'OPTIONS'])
def login_alt():
    """Alternative login endpoint without /auth/ prefix"""
    if request.method == 'OPTIONS':
        return '', 200
    return login()




# ============================================================================
# ML-POWERED TUTOR MATCHING ENDPOINT
# ============================================================================

def save_model_if_needed():
    """Save model every 10 updates"""
    global update_counter
    update_counter += 1
    if update_counter % 10 == 0:
        rl_system.save_model(MODEL_PATH)
        print(f"✓ Auto-saved RL model (update #{update_counter})")

# ============================================================================
# AGORA TOKEN ENDPOINT
# ============================================================================

@app.route('/api/agora/token', methods=['POST'])
def generate_agora_token():
    """
    Generate a short-lived Agora RTC token for a caller/callee.

    Body:
        channelName  – Agora channel (== meetingId used by VoiceCall)
        uid          – numeric uid the client will join with (int)
        role         – 'publisher' | 'subscriber'  (default: publisher)

    Returns:
        { "token": "<agora-rtc-token>", "uid": <int>, "channel": "<name>" }

    Setup:
        1. pip install agora-token-builder
        2. Set AGORA_APP_ID and AGORA_APP_CERTIFICATE in your Render env vars.
           (AGORA_APP_ID is already in the frontend — add AGORA_APP_CERTIFICATE
            from Agora Console → Project Management → your project → Certificate.)
    """
    try:
        data         = request.get_json() or {}
        channel_name = data.get('channelName', '').strip()
        uid          = int(data.get('uid', 0))
        role_str     = data.get('role', 'publisher')

        if not channel_name:
            return jsonify({'error': 'channelName is required'}), 400

        agora_app_id   = os.getenv('AGORA_APP_ID', '56b7bde5aa344709a6727b7a343ad954')
        agora_app_cert = os.getenv('AGORA_APP_CERTIFICATE', '')

        # ── No certificate → return a null token (works for Agora projects
        #    that have App-Certificate disabled in the console) ──────────────
        if not agora_app_cert:
            print('[AGORA] WARNING: AGORA_APP_CERTIFICATE not set — returning null token.')
            print('[AGORA] Token-based auth is DISABLED for this project in Agora console.')
            return jsonify({'token': None, 'uid': uid, 'channel': channel_name}), 200

        try:
            from agora_token_builder import RtcTokenBuilder
        except ImportError:
            print('[AGORA] agora-token-builder not installed — pip install agora-token-builder')
            return jsonify({'token': None, 'uid': uid, 'channel': channel_name}), 200

        # Role: 1 = publisher, 2 = subscriber
        role = 1 if role_str == 'publisher' else 2

        # Token valid for 1 hour (matches session limit)
        expire_ts = int(time.time()) + 3600

        token = RtcTokenBuilder.buildTokenWithUid(
            agora_app_id,
            agora_app_cert,
            channel_name,
            uid,
            role,
            expire_ts,
        )

        print(f'[AGORA] Token generated for channel={channel_name} uid={uid}')
        return jsonify({'token': token, 'uid': uid, 'channel': channel_name}), 200

    except Exception as e:
        print(f'[AGORA] Token generation error: {e}')
        import traceback; traceback.print_exc()
        return jsonify({'error': str(e)}), 500
        
@app.route('/api/match/tutors', methods=['POST'], endpoint="match")
@jwt_required()
def get_tutor_matches():
    """
    Get RL-enhanced tutor recommendations
    """
    try:
        student_id = get_jwt_identity()
        data = request.get_json()
        
        student_profile = data.get('student_profile')
        use_rl = data.get('use_rl', True)

        if not student_profile:
            return jsonify({'error': 'Student profile required'}), 400

        # Always enrich from DB to ensure gender pref and goals are present
        from_db = StudentProfile.query.filter_by(user_id=int(student_id)).first()
        if from_db:
            if 'tutor_gender_preference' not in student_profile or not student_profile.get('tutor_gender_preference'):
                student_profile['tutor_gender_preference'] = from_db.tutor_gender_preference or 'no_preference'
            if 'selected_goals' not in student_profile:
                student_profile['selected_goals'] = json.loads(from_db.selected_goals or '[]')

        print(f"[MATCH] tutor_gender_preference: {student_profile.get('tutor_gender_preference')}")

        # Get all tutors from database
        tutors = db.session.query(TutorProfile).join(User).filter(
            User.user_type == 'tutor',
            TutorProfile.verified == True
        ).all()

        # Convert to dict format for matching system
        tutors_list = []
        for tutor in tutors:
            tutors_list.append({
                'id': tutor.user_id,
                'name': tutor.user.full_name,
                'expertise': json.loads(tutor.expertise) if tutor.expertise else [],
                'languages': json.loads(tutor.languages) if tutor.languages else [],
                'availability': json.loads(tutor.availability) if tutor.availability else {},
                'rating': tutor.rating if tutor.rating is not None else None,
                'total_sessions': tutor.total_sessions or 0,
                'gender': getattr(tutor.user, 'gender', '') or '',
                'teaching_style': getattr(tutor, 'teaching_style', 'adaptive') or 'adaptive'
            })

        # Get matches using RL system
        matches = rl_system.match_student_to_tutors(
            student_id,
            student_profile,
            tutors_list,
            use_rl=use_rl
        )

        # Enhance with additional tutor info
        enhanced_matches = []
        for match in matches[:10]:  # Top 10
            tutor = next((t for t in tutors if t.user_id == match['tutor_id']), None)
            if tutor:
                enhanced_matches.append({
                    **match,
                    'bio': tutor.bio,
                    'hourly_rate': tutor.hourly_rate,
                    'years_experience': getattr(tutor, 'years_experience', ''),
                    'education': getattr(tutor, 'education', '')
                })

        return jsonify({
            'success': True,
            'matches': enhanced_matches,
            'using_rl': use_rl
        }), 200

    except Exception as e:
        print(f"Error in get_tutor_matches: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500
    """
    Get RL-enhanced tutor recommendations
    """
    try:
        student_id = get_jwt_identity()
        data = request.get_json()
        
        student_profile = data.get('student_profile')
        use_rl = data.get('use_rl', True)
        if 'tutor_gender_preference' not in student_profile:
            from_db = StudentProfile.query.filter_by(user_id=int(student_id)).first()
            if from_db:
                student_profile['tutor_gender_preference'] = from_db.tutor_gender_preference or 'no_preference'
                student_profile['selected_goals'] = json.loads(from_db.selected_goals or '[]')
                
                if not student_profile:
                    return jsonify({'error': 'Student profile required'}), 400
        
        # Get all tutors from database
        tutors = db.session.query(TutorProfile).join(User).filter(
            User.user_type == 'tutor',
            TutorProfile.verified == True
        ).all()
        
        # Convert to dict format for matching system
        tutors_list = []
        for tutor in tutors:
            tutors_list.append({
                'id': tutor.user_id,
                'name': tutor.user.full_name,
                'expertise': json.loads(tutor.expertise) if tutor.expertise else [],
                'languages': json.loads(tutor.languages) if tutor.languages else [],
                'availability': json.loads(tutor.availability) if tutor.availability else {},
                'rating': tutor.rating if tutor.rating else None,
                'total_sessions': tutor.total_sessions or 0,
                'gender': getattr(tutor.user, 'gender', ''),
                'teaching_style': getattr(tutor, 'teaching_style', 'adaptive')
            })
        
        # Get matches using RL system
        matches = rl_system.match_student_to_tutors(
            student_id,
            student_profile,
            tutors_list,
            use_rl=use_rl
        )
        
        # Enhance with additional tutor info
        enhanced_matches = []
        for match in matches[:10]:  # Top 10
            tutor = next((t for t in tutors if t.user_id == match['tutor_id']), None)
            if tutor:
                enhanced_matches.append({
                    **match,
                    'bio': tutor.bio,
                    'hourly_rate': tutor.hourly_rate,
                    'years_experience': getattr(tutor, 'years_experience', ''),
                    'education': getattr(tutor, 'education', '')
                })
        
        return jsonify({
            'success': True,
            'matches': enhanced_matches,
            'using_rl': use_rl
        }), 200
        
    except Exception as e:
        print(f"Error in get_tutor_matches: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/debug/check-tutor-data', methods=['GET'])
def check_tutor_data():
    """Check for tutors with invalid data"""
    tutors = TutorProfile.query.filter_by(verified=True).all()
    
    issues = []
    for tutor in tutors:
        tutor_issues = {
            'id': tutor.id,
            'name': tutor.user.full_name if tutor.user else 'NO USER',
            'problems': []
        }
        
        # Check expertise
        try:
            expertise = json.loads(tutor.expertise) if tutor.expertise else []
            if not expertise:
                tutor_issues['problems'].append('No expertise')
            elif any(not e or not str(e).strip() for e in expertise):
                tutor_issues['problems'].append(f'Invalid expertise values: {expertise}')
        except:
            tutor_issues['problems'].append('Invalid expertise JSON')
        
        # Check languages
        try:
            languages = json.loads(tutor.languages) if tutor.languages else []
            if not languages:
                tutor_issues['problems'].append('No languages')
            elif any(not l or not str(l).strip() for l in languages):
                tutor_issues['problems'].append(f'Invalid language values: {languages}')
        except:
            tutor_issues['problems'].append('Invalid languages JSON')
        
        if tutor_issues['problems']:
            issues.append(tutor_issues)
    
    return jsonify({
        'total_tutors': len(tutors),
        'tutors_with_issues': len(issues),
        'issues': issues
    }), 200
@app.route('/api/debug/test-match', methods=['POST'])
def test_match():
    """Debug matching with detailed logging"""
    try:
        data = request.get_json()
        student_profile = data.get('student_profile')
        
        print("\n" + "="*70)
        print("DEBUG: Testing Match")
        print("="*70)
        print(f"Student profile received: {json.dumps(student_profile, indent=2)}")
        
        # Check for None values
        none_fields = []
        for key, value in student_profile.items():
            if value is None:
                none_fields.append(key)
            elif isinstance(value, list):
                if None in value:
                    none_fields.append(f"{key} (contains None)")
        
        if none_fields:
            print(f"⚠️ WARNING: Fields with None values: {none_fields}")
        
        # Test prepare_student_features
        try:
            student_features = rl_system.prepare_student_features(student_profile)
            print(f"✅ Student features prepared: {student_features}")
        except Exception as e:
            print(f"❌ Error in prepare_student_features: {e}")
            import traceback
            traceback.print_exc()
            return jsonify({'error': f'Error preparing student features: {str(e)}'}), 500
        
        # Get tutors
        tutors = db.session.query(TutorProfile).join(User).filter(
            User.user_type == 'tutor',
            TutorProfile.verified == True
        ).all()
        
        print(f"Found {len(tutors)} tutors")
        
        # Test each tutor
        for tutor in tutors:
            try:
                expertise = json.loads(tutor.expertise) if tutor.expertise else []
                languages = json.loads(tutor.languages) if tutor.languages else []
                
                tutor_dict = {
                    'id': tutor.user_id,
                    'name': tutor.user.full_name,
                    'expertise': expertise,
                    'languages': languages,
                    'availability': json.loads(tutor.availability) if tutor.availability else {},
                    'rating': tutor.rating or 4.0,
                    'total_sessions': tutor.total_sessions or 0,
                    'teaching_style': getattr(tutor, 'teaching_style', 'adaptive')
                }
                
                print(f"\nTesting tutor: {tutor_dict['name']}")
                print(f"  Expertise: {tutor_dict['expertise']}")
                print(f"  Languages: {tutor_dict['languages']}")
                
                # Test prepare_tutor_features
                tutor_features = rl_system.prepare_tutor_features(tutor_dict)
                print(f"  ✅ Tutor features prepared: {tutor_features}")
                
            except Exception as e:
                print(f"  ❌ Error with tutor {tutor.user.full_name}: {e}")
                import traceback
                traceback.print_exc()
        
        return jsonify({'success': True, 'message': 'Check server logs'}), 200
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500
    



# ============================================================================
# ASSIGNMENT ENDPOINTS
# ============================================================================

@app.route('/api/student/assignments', methods=['GET'])
@jwt_required()
def get_student_assignments():
    """Get all assignments for a student"""
    try:
        user_id_str = get_jwt_identity()
        user_id = int(user_id_str)
        user = User.query.get(user_id)
        
        if not user or user.user_type != 'student':
            return jsonify({'error': 'Only students can access assignments'}), 403
        
        # Get all enrolled courses
        enrollments = Enrollment.query.filter_by(student_id=user_id).all()
        course_ids = [e.course_id for e in enrollments]
        
        # Get assignments for enrolled courses
        assignments = Assignment.query.filter(
            Assignment.course_id.in_(course_ids)
        ).order_by(Assignment.due_date.desc()).all()
        
        assignments_list = []
        for assignment in assignments:
            # Get submission if exists
            submission = AssignmentSubmission.query.filter_by(
                assignment_id=assignment.id,
                student_id=user_id
            ).first()
            
            course = Course.query.get(assignment.course_id)
            
            # Calculate class average
            all_submissions = AssignmentSubmission.query.filter_by(
                assignment_id=assignment.id,
                status='graded'
            ).all()
            
            class_average = None
            if all_submissions:
                scores = [s.score for s in all_submissions if s.score is not None]
                if scores:
                    class_average = round(sum(scores) / len(scores), 1)
            
            # Determine status
            status = 'pending'
            if submission:
                if submission.status == 'graded':
                    status = 'graded'
                elif submission.late_submission:
                    status = 'late'
                else:
                    status = 'submitted'
            
            assignment_data = {
                'id': assignment.id,
                'title': assignment.title,
                'description': assignment.description,
                'course': course.title if course else 'Unknown',
                'courseCode': course.category if course else 'N/A',
                'dueDate': assignment.due_date.strftime('%Y-%m-%d'),
                'submittedDate': submission.submitted_at.strftime('%Y-%m-%d') if submission else None,
                'status': status,
                'score': submission.score if submission else None,
                'maxScore': assignment.max_score,
                'classAverage': class_average,
                'grade': submission.grade if submission else None,
                'feedback': submission.feedback if submission else None,
                'comments': submission.comments if submission else None,
                'files': json.loads(submission.files) if submission and submission.files else [],
                'lateSubmission': submission.late_submission if submission else False,
                'professor': assignment.tutor.user.full_name if assignment.tutor else 'Unknown',
                'rubric': json.loads(submission.rubric_scores) if submission and submission.rubric_scores else []
            }
            
            assignments_list.append(assignment_data)
        
        return jsonify({'assignments': assignments_list}), 200
        
    except Exception as e:
        print(f"❌ [ASSIGNMENTS ERROR] {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Failed to get assignments'}), 500


@app.route('/api/assignments/<int:assignment_id>/submit', methods=['POST'])
@jwt_required()
def submit_assignment(assignment_id):
    """Submit an assignment with Cloudinary upload"""
    try:
        user_id_str = get_jwt_identity()
        user_id = int(user_id_str)
        user = User.query.get(user_id)
        
        if not user or user.user_type != 'student':
            return jsonify({'error': 'Only students can submit assignments'}), 403
        
        assignment = Assignment.query.get(assignment_id)
        if not assignment:
            return jsonify({'error': 'Assignment not found'}), 404
        
        # Check if already submitted
        existing = AssignmentSubmission.query.filter_by(
            assignment_id=assignment_id,
            student_id=user_id
        ).first()
        
        if existing:
            return jsonify({'error': 'Assignment already submitted'}), 400
        
        # Handle file uploads to Cloudinary
        uploaded_files = []
        if 'files' in request.files:
            files = request.files.getlist('files')
            
            print(f"[ASSIGNMENT UPLOAD] 📤 Uploading {len(files)} files to Cloudinary")
            
            for file in files:
                if file.filename:
                    try:
                        filename = secure_filename(file.filename)
                        
                        # Determine resource type based on file extension
                        file_ext = filename.rsplit('.', 1)[1].lower() if '.' in filename else ''
                        
                        # Videos and audio files need resource_type='video'
                        # PDFs and documents need resource_type='raw'
                        # Images use resource_type='image' (default)
                        if file_ext in ['mp4', 'mov', 'avi', 'mkv', 'webm', 'mp3', 'wav']:
                            resource_type = 'video'
                        elif file_ext in ['pdf', 'doc', 'docx', 'txt', 'xls', 'xlsx', 'ppt', 'pptx', 'zip']:
                            resource_type = 'raw'
                        else:
                            resource_type = 'image'
                        
                        print(f"[ASSIGNMENT UPLOAD] Uploading {filename} as {resource_type}")
                        
                        # Upload to Cloudinary
                        upload_result = cloudinary.uploader.upload(
                            file,
                            resource_type=resource_type,
                            folder=f'assignments/{assignment_id}',
                            public_id=f"student_{user_id}_{datetime.utcnow().timestamp()}_{filename}",
                            overwrite=False
                        )
                        
                        file_url = upload_result['secure_url']
                        
                        uploaded_files.append({
                            'url': file_url,
                            'filename': filename,
                            'size': upload_result.get('bytes', 0),
                            'type': resource_type
                        })
                        
                        print(f"[ASSIGNMENT UPLOAD] ✅ Uploaded: {file_url}")
                        
                    except Exception as upload_error:
                        print(f"❌ [ASSIGNMENT UPLOAD] Failed to upload {filename}: {upload_error}")
                        # Continue with other files even if one fails
                        continue
        
        # Get comments
        comments = request.form.get('comments', '')
        
        # Check if late
        is_late = datetime.utcnow() > assignment.due_date
        
        # Create submission
        submission = AssignmentSubmission(
            assignment_id=assignment_id,
            student_id=user_id,
            status='submitted',
            comments=comments,
            files=json.dumps(uploaded_files),  # Store as JSON with URLs and metadata
            late_submission=is_late
        )
        
        db.session.add(submission)
        db.session.commit()
        
        print(f"✅ [ASSIGNMENT] Submission created: {submission.id}")
        print(f"✅ [ASSIGNMENT] Files uploaded: {len(uploaded_files)}")
        
        return jsonify({
            'message': 'Assignment submitted successfully',
            'submission_id': submission.id,
            'late': is_late,
            'files_uploaded': len(uploaded_files),
            'files': uploaded_files
        }), 201
        
    except Exception as e:
        db.session.rollback()
        print(f"❌ [SUBMIT ERROR] {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Failed to submit assignment'}), 500

@app.route('/api/tutor/assignments/create', methods=['POST'])
@jwt_required()
def create_assignment():
    """Create a new assignment (tutor only)"""
    try:
        user_id_str = get_jwt_identity()
        user_id = int(user_id_str)
        user = User.query.get(user_id)
        
        if not user or user.user_type != 'tutor':
            return jsonify({'error': 'Only tutors can create assignments'}), 403
        
        tutor_profile = user.tutor_profile
        if not tutor_profile:
            return jsonify({'error': 'Tutor profile not found'}), 404
        
        data = request.get_json()
        
        # Validate required fields
        if not all(k in data for k in ['title', 'due_date', 'course_id']):
            return jsonify({'error': 'Missing required fields'}), 400
        
        # Parse due date
        due_date = datetime.strptime(data['due_date'], '%Y-%m-%d')
        
        assignment = Assignment(
            tutor_id=tutor_profile.id,
            course_id=data['course_id'],
            title=data['title'],
            description=data.get('description', ''),
            due_date=due_date,
            max_score=data.get('max_score', 100)
        )
        
        db.session.add(assignment)
        db.session.commit()
        
        return jsonify({
            'message': 'Assignment created successfully',
            'assignment_id': assignment.id
        }), 201
        
    except Exception as e:
        db.session.rollback()
        print(f"❌ [CREATE ASSIGNMENT ERROR] {str(e)}")
        return jsonify({'error': 'Failed to create assignment'}), 500


@app.route('/api/tutor/assignments/<int:assignment_id>/grade', methods=['POST'])
@jwt_required()
def grade_assignment(assignment_id):
    """Grade a student's assignment submission"""
    try:
        user_id_str = get_jwt_identity()
        user_id = int(user_id_str)
        user = User.query.get(user_id)
        
        if not user or user.user_type != 'tutor':
            return jsonify({'error': 'Only tutors can grade assignments'}), 403
        
        data = request.get_json()
        submission_id = data.get('submission_id')
        
        submission = AssignmentSubmission.query.get(submission_id)
        if not submission:
            return jsonify({'error': 'Submission not found'}), 404
        
        # Check ownership
        if submission.assignment.tutor.user_id != user_id:
            return jsonify({'error': 'Not authorized'}), 403
        
        # Update grade
        submission.score = data.get('score')
        submission.grade = data.get('grade')
        submission.feedback = data.get('feedback', '')
        submission.rubric_scores = json.dumps(data.get('rubric', []))
        submission.status = 'graded'
        
        db.session.commit()
        
        return jsonify({'message': 'Assignment graded successfully'}), 200
        
    except Exception as e:
        db.session.rollback()
        print(f"❌ [GRADE ERROR] {str(e)}")
        return jsonify({'error': 'Failed to grade assignment'}), 500



@app.route('/api/match/record-outcome', methods=['POST'],endpoint="record-outcome")
@jwt_required()
def record_match_outcome():
    """
    Record the outcome of a student-tutor match for RL learning
    
    Request body:
    {
        "tutor_id": "tutor_123",
        "outcome": {
            "satisfaction_rating": 5,  // 1-5
            "completed": true,
            "would_recommend": true,
            "response_time": 2.5,  // hours
            "punctuality_score": 0.95  // 0-1
        },
        "student_profile": {...},  // Current student profile
        "session_type": "initial" | "ongoing" | "completed"
    }
    """
    try:
        student_id = get_jwt_identity()
        data = request.get_json()
        
        tutor_id = int(data.get('tutor_id'))
        outcome = data.get('outcome')
        student_profile = data.get('student_profile')
        
        if not all([tutor_id, outcome, student_profile]):
            return jsonify({'error': 'Missing required fields'}), 400
        
        # Get tutor profile
        tutor = db.session.query(TutorProfile).filter_by(user_id=tutor_id).first()
        if not tutor:
            return jsonify({'error': 'Tutor not found'}), 404
        
        tutor_profile = {
            'id': tutor.user_id,
            'expertise': tutor.expertise or [],
            'languages': tutor.languages or [],
            'availability': tutor.availability or {},
            'rating': tutor.rating or 4.0,
            'total_sessions': tutor.total_sessions or 0,
            'teaching_style': tutor.teaching_style or 'adaptive'
        }
        
        # Record outcome in RL system
        reward = rl_system.record_match_outcome(
            student_id,
            tutor_id,
            student_profile,
            tutor_profile,
            outcome
        )
        
        # Update tutor statistics in database
        tutor.total_sessions = rl_system.tutor_performance[tutor_id]['total_matches']
        
        # Update average rating
        satisfaction = outcome.get('satisfaction_rating', 3) / 5.0
        if tutor.rating:
            # Running average
            n = tutor.total_sessions
            tutor.rating = (tutor.rating * (n - 1) + (satisfaction * 5)) / n
        else:
            tutor.rating = satisfaction * 5
        
        db.session.commit()
        
        # Save model periodically
        save_model_if_needed()
        
        return jsonify({
            'success': True,
            'reward': round(reward, 3),
            'message': 'Outcome recorded and model updated'
        }), 200
        
    except Exception as e:
        print(f"Error in record_match_outcome: {str(e)}")
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@app.route('/api/match/quick-feedback', methods=['POST'],endpoint="quick feedback")
@jwt_required()
def record_quick_feedback():
    """
    Quick feedback recording (simpler than full outcome)
    
    Request body:
    {
        "tutor_id": "tutor_123",
        "rating": 4,  // 1-5 stars
        "completed": true
    }
    """
    try:
        student_id = get_jwt_identity()
        data = request.get_json()
        
        tutor_id = int(data.get('tutor_id'))
        
        completed = data.get('completed', True)
        
        # Get student and tutor profiles
        student = db.session.query(StudentProfile).filter_by(user_id=student_id).first()
        tutor = db.session.query(TutorProfile).filter_by(user_id=tutor_id).first()
        
        if not student or not tutor:
            return jsonify({'error': 'Profile not found'}), 404
        
        # Create simplified outcome
        outcome = data.get('outcome')

        if not outcome:
                return jsonify({'error': 'Outcome required'}), 400
        
        student_profile = {
            'preferred_subjects': student.preferred_subjects or [],
            'skill_level': student.skill_level or 'intermediate',
            'learning_style': student.learning_style or 'visual',
            'available_time': student.available_time or 'evening',
            'preferred_languages': student.preferred_languages or ['english'],
            'math_score': student.math_score or 5,
            'science_score': student.science_score or 5,
            'language_score': student.language_score or 5,
            'tech_score': student.tech_score or 5,
            'motivation_level': student.motivation_level or 7
        }
        
        tutor_profile = {
            'id': tutor.user_id,
            'expertise': tutor.expertise or [],
            'languages': tutor.languages or [],
            'availability': tutor.availability or {},
            'rating': tutor.rating or 4.0,
            'total_sessions': tutor.total_sessions or 0,
            'teaching_style': tutor.teaching_style or 'adaptive'
        }
        
        reward = rl_system.record_match_outcome(
            student_id,
            tutor_id,
            student_profile,
            tutor_profile,
            outcome
        )

        # Sync to DB
        tutor.total_sessions = rl_system.tutor_performance[tutor_id]['total_matches']
        satisfaction = outcome.get('satisfaction_rating', 3) / 5.0
        n = tutor.total_sessions
        if tutor.rating and n > 1:
            tutor.rating = (tutor.rating * (n - 1) + (satisfaction * 5)) / n
        else:
            tutor.rating = satisfaction * 5
        db.session.commit()

        save_model_if_needed()

        return jsonify({
            'success': True,
            'reward': round(reward, 3),
            'message': 'Feedback recorded'
        }), 200
    except Exception as e:
        import traceback
        traceback.print_exc()
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@app.route('/api/tutor/performance/<tutor_id>', methods=['GET'])
@jwt_required()
def get_tutor_performance(tutor_id):
    """
    Get detailed performance metrics for a tutor
    """
    try:
        perf = rl_system.tutor_performance[int(tutor_id)]
        
        if perf['total_matches'] == 0:
            return jsonify({
                'success': True,
                'has_data': False,
                'message': 'No performance data yet'
            }), 200
        
        return jsonify({
            'success': True,
            'has_data': True,
            'performance': {
                'total_matches': perf['total_matches'],
                'successful_matches': perf['successful_matches'],
                'success_rate': perf['successful_matches'] / perf['total_matches'],
                'avg_satisfaction': perf['avg_satisfaction'],
                'completion_rate': perf['completion_rate'],
                'student_retention': perf['student_retention'],
                'response_time_score': perf['response_time_score'],
                'reliability_score': perf['reliability_score'],
                'overall_score': rl_system.calculate_tutor_performance_score(tutor_id)
            }
        }), 200
        
    except Exception as e:
        print(f"Error in get_tutor_performance: {str(e)}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/student/preferences', methods=['GET'])
@jwt_required()
def get_student_preferences():
    """
    Get learned preferences for current student
    """
    try:
        student_id = get_jwt_identity()
        prefs = rl_system.student_preferences[student_id]
        
        if not prefs['match_history']:
            return jsonify({
                'success': True,
                'has_data': False,
                'message': 'No learning data yet'
            }), 200
        
        return jsonify({
            'success': True,
            'has_data': True,
            'preferences': {
                'total_matches': len(prefs['match_history']),
                'avg_satisfaction': (
                    sum(prefs['satisfaction_history']) / len(prefs['satisfaction_history'])
                    if prefs['satisfaction_history'] else 0
                ),
                'weight_adjustments': prefs['weight_adjustments'],
                'recent_matches': prefs['match_history'][-5:]  # Last 5
            }
        }), 200
        
    except Exception as e:
        print(f"Error in get_student_preferences: {str(e)}")
        return jsonify({'error': str(e)}), 500


# Manual model management endpoints (admin only)
@app.route('/api/admin/rl-model/save', methods=['POST'])
@jwt_required()
def admin_save_model():
    """Admin endpoint to manually save model"""
    try:
        # Check if admin (you'd add proper admin check here)
        rl_system.save_model(MODEL_PATH)
        return jsonify({
            'success': True,
            'message': 'Model saved successfully'
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/admin/rl-model/stats', methods=['GET'])
@jwt_required()
def admin_get_stats():
    """Get overall RL system statistics"""
    try:
        total_tutors = len(rl_system.tutor_performance)
        total_students = len(rl_system.student_preferences)
        total_matches = sum(
            perf['total_matches'] 
            for perf in rl_system.tutor_performance.values()
        )
        
        return jsonify({
            'success': True,
            'stats': {
                'total_tutors_tracked': total_tutors,
                'total_students_tracked': total_students,
                'total_matches_recorded': total_matches,
                'model_updates': update_counter,
                'exploration_rate': rl_system.epsilon
            }
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
@app.route('/api/debug/check-profile/<int:profile_id>', methods=['GET'])
def debug_check_profile(profile_id):
    """Debug endpoint to check tutor profile"""
    try:
        profile = TutorProfile.query.get(profile_id)
        
        if not profile:
            return jsonify({'error': 'Profile not found'}), 404
        
        return jsonify({
            'profile_id': profile.id,
            'user_id': profile.user_id,
            'verified': profile.verified,
            'verified_type': str(type(profile.verified)),
            'verified_repr': repr(profile.verified),
            'bio': profile.bio[:50] if profile.bio else None,
            'expertise': profile.expertise[:50] if profile.expertise else None,
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500



# ============================================================================
# TEST/DEBUG ENDPOINTS
# ============================================================================

@app.route('/api/test', methods=['GET'])
def test_endpoint():
    """Test endpoint to verify server is working"""
    print("[TEST] Test endpoint was hit!")
    return jsonify({
        'message': 'Server is working!',
        'timestamp': datetime.utcnow().isoformat()
    }), 200

@app.route('/api/debug/request', methods=['POST'])
def debug_request():
    """Debug endpoint to see what data is being sent"""
    print("\n" + "="*70)
    print("[DEBUG] Request received!")
    print("="*70)
    print(f"Method: {request.method}")
    print(f"Headers: {dict(request.headers)}")
    print(f"Content-Type: {request.content_type}")
    print(f"Data: {request.get_data(as_text=True)}")
    
    try:
        json_data = request.get_json(force=True)
        print(f"JSON Data: {json.dumps(json_data, indent=2)}")
    except Exception as e:
        print(f"Could not parse JSON: {e}")
    
    print("="*70 + "\n")
    
    return jsonify({'received': True}), 200

# ============================================================================
# STUDENT ENDPOINTS
# ============================================================================

@app.route('/api/student/survey', methods=['POST'], endpoint="Survey")
@jwt_required()
def save_student_survey():
    """Save student survey/preferences - with comprehensive debugging"""
    
    print("\n" + "🔵"*35)
    print("🔵 SURVEY ENDPOINT HIT!")
    print("🔵"*35)
    
    # Handle OPTIONS request for CORS preflight

    
    try:
        print(f"[SURVEY] Method: {request.method}")
        print(f"[SURVEY] Headers: {dict(request.headers)}")
        
        # Get user identity - convert to int
        user_id_str = get_jwt_identity()
        print(f"[SURVEY] User ID (string): {user_id_str}")
        
        if not user_id_str:
            print("[SURVEY ERROR] No user_id - authentication failed")
            return jsonify({'error': 'Authentication required'}), 401
        
        # Convert string ID to integer
        user_id = int(user_id_str)
        print(f"[SURVEY] User ID (converted to int): {user_id}")
        
        user = User.query.get(user_id)
        
        if not user:
            print(f"[SURVEY ERROR] User not found: {user_id}")
            return jsonify({'error': 'User not found'}), 404
            
        if user.user_type != 'student':
            print(f"[SURVEY ERROR] User is not a student: {user.user_type}")
            return jsonify({'error': 'Only students can complete surveys'}), 403
        
        # Get request data
        raw_data = request.get_data(as_text=True)
        print(f"[SURVEY] Raw data: {raw_data}")
        
        data = request.get_json(force=True, silent=True)
        
        # Debug: Print received data
        print(f"[SURVEY] Parsed JSON data:")
        print(json.dumps(data, indent=2))
        
        if not data:
            print("[SURVEY ERROR] No data provided or couldn't parse JSON")
            return jsonify({'error': 'No data provided'}), 400
        
        # Get or create student profile
        profile = user.student_profile
        if not profile:
            print(f"[SURVEY] Creating new profile for user {user_id}")
            profile = StudentProfile(user_id=user.id)
            db.session.add(profile)
            db.session.flush()
        else:
            print(f"[SURVEY] Updating existing profile {profile.id}")
        
        # Handle different possible field names from frontend
        # Support both camelCase and snake_case
        profile.learning_style = (
            data.get('learningStyle') or 
            data.get('learning_style') or 
            data.get('style') or
            'visual'  # default
        )
        print(f"[SURVEY] Learning style: {profile.learning_style}")
        
        # Handle subjects - can be array or string
        subjects = data.get('subjects') or data.get('preferred_subjects') or []
        if isinstance(subjects, str):
            subjects = [s.strip() for s in subjects.split(',')]
        profile.preferred_subjects = json.dumps(subjects)
        print(f"[SURVEY] Subjects: {subjects}")
        
        # Handle skill level
        profile.skill_level = (
            data.get('skillLevel') or 
            data.get('skill_level') or 
            data.get('level') or 
            'beginner'
        )
        print(f"[SURVEY] Skill level: {profile.skill_level}")
        
        # Handle goals
        profile.learning_goals = (
            data.get('goals') or 
            data.get('learning_goals') or 
            data.get('learningGoals') or
            ''
        )
        
        # Handle availability
        profile.available_time = (
            data.get('availability') or 
            data.get('available_time') or 
            data.get('availableTime') or
            'evening'
        )
        print(f"[SURVEY] Availability: {profile.available_time}")
        
        # Handle languages
        languages = (
            data.get('languages') or 
            data.get('preferred_languages') or 
            data.get('preferredLanguages') or 
            ['English']
        )
        if isinstance(languages, str):
            languages = [lang.strip() for lang in languages.split(',')]
        profile.preferred_languages = json.dumps(languages)
        print(f"[SURVEY] Languages: {languages}")
        
        # Optional: detailed scores (default to 5 if not provided)
        profile.math_score = int(
            data.get('mathScore') or 
            data.get('math_score') or 
            5
        )
        profile.science_score = int(
            data.get('scienceScore') or 
            data.get('science_score') or 
            5
        )
        profile.language_score = int(
            data.get('languageScore') or 
            data.get('language_score') or 
            5
        )
        profile.tech_score = int(
            data.get('techScore') or 
            data.get('tech_score') or 
            5
        )
        profile.motivation_level = int(
            data.get('motivationLevel') or 
            data.get('motivation_level') or 
            7
        )
        if 'selected_goals' in data:
            profile.selected_goals = json.dumps(data['selected_goals'])
        if 'tutor_gender_preference' in data:
            profile.tutor_gender_preference = data['tutor_gender_preference']
        if 'selected_goals' in data:
            profile.selected_goals = json.dumps(data['selected_goals'])
        profile.survey_completed = True
        

        
        print("[SURVEY] About to commit to database...")
        
        # Commit to database
        db.session.commit()
        
        print(f"✅ [SURVEY] Successfully saved survey for user {user_id}")
        
        response_data = {
            'message': 'Survey saved successfully',
            'profile': {
                'id': profile.id,
                'learning_style': profile.learning_style,
                'preferred_subjects': json.loads(profile.preferred_subjects or '[]'),
                'skill_level': profile.skill_level,
                'available_time': profile.available_time,
                'survey_completed': profile.survey_completed,
                'tutor_gender_preference': profile.tutor_gender_preference,  # ← add this
                'selected_goals': json.loads(profile.selected_goals or '[]')
            }
        }
        
        print(f"[SURVEY] Sending response: {json.dumps(response_data, indent=2)}")
        print("🔵"*35 + "\n")
        
        return jsonify(response_data), 200
        
    except Exception as e:
        db.session.rollback()
        error_message = str(e)
        print(f"❌ [SURVEY ERROR] Exception: {error_message}")
        import traceback
        print(traceback.format_exc())
        print("🔵"*35 + "\n")
        
        return jsonify({
            'error': 'Failed to save survey',
            'details': error_message
        }), 500

@app.route('/api/student/profile', methods=['GET'])
@jwt_required()
def get_student_profile_enhanced():
    """Get enhanced student profile with all details"""
    user_id_str = get_jwt_identity()
    user_id = int(user_id_str)
    user = User.query.get(user_id)
    
    if not user or user.user_type != 'student':
        return jsonify({'error': 'Not authorized'}), 403
    
    profile = user.student_profile
    
    if not profile:
        return jsonify({
            'profile': None,
            'survey_completed': False
        }), 200
    
    return jsonify({
        'profile': {
            # Learning preferences
            'learning_style': profile.learning_style,
            'preferred_subjects': json.loads(profile.preferred_subjects or '[]'),
            'skill_level': profile.skill_level,
            'learning_goals': profile.learning_goals,
            'available_time': profile.available_time,
            'preferred_languages': json.loads(profile.preferred_languages or '[]'),
            'survey_completed': profile.survey_completed,
            
            # Skills assessment
            'math_score': profile.math_score,
            'science_score': profile.science_score,
            'language_score': profile.language_score,
            'tech_score': profile.tech_score,
            'motivation_level': profile.motivation_level,
            'selected_goals': json.loads(profile.selected_goals or '[]'),
            'tutor_gender_preference': profile.tutor_gender_preference or 'no_preference',
            
            # Additional fields (add these to StudentProfile model)
            'bio': getattr(profile, 'bio', ''),
            'weekly_study_hours': getattr(profile, 'weekly_study_hours', ''),
            'preferred_session_length': getattr(profile, 'preferred_session_length', '60'),
            'learning_pace': getattr(profile, 'learning_pace', 'moderate')
        }
    }), 200


@app.route('/api/upload/material', methods=['POST', 'OPTIONS'], endpoint='upload_material')
@jwt_required()
def upload_material():
    """Upload course material to Cloudinary"""
    
    if request.method == 'OPTIONS':
        return '', 200
    
    try:
        print("\n" + "📤"*35)
        print("📤 MATERIAL UPLOAD TO CLOUDINARY!")
        print("📤"*35)
        
        # Get and validate user
        user_id_str = get_jwt_identity()
        if not user_id_str:
            return jsonify({'error': 'Authentication required'}), 401
        
        user_id = int(user_id_str)
        user = User.query.get(user_id)
        
        if not user or user.user_type != 'tutor':
            return jsonify({'error': 'Only tutors can upload materials'}), 403
        
        # Validate course_id
        course_id = request.form.get('course_id')
        if not course_id:
            return jsonify({'error': 'Course ID is required'}), 400
        
        course_id = int(course_id)
        course = Course.query.get(course_id)
        
        if not course:
            return jsonify({'error': 'Course not found'}), 404
        
        # Check ownership
        if course.tutor.user_id != user.id:
            return jsonify({'error': 'Not authorized to upload to this course'}), 403
        
        # Validate file
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        
        file = request.files['file']
        
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        # Get material metadata
        material_title = request.form.get('title', file.filename)
        material_type = request.form.get('type', 'document')
        order = int(request.form.get('order', 0))
        duration = request.form.get('duration', 0)
        
        print(f"[UPLOAD] File: {file.filename}")
        print(f"[UPLOAD] Title: {material_title}")
        print(f"[UPLOAD] Type: {material_type}")
        print(f"[UPLOAD] Course ID: {course_id}")
        
        # Validate file size (500MB max)
        file.seek(0, os.SEEK_END)
        file_size = file.tell()
        file.seek(0)
        
        if file_size > 500 * 1024 * 1024:
            return jsonify({'error': 'File too large (max 500MB)'}), 400
        
        # Determine Cloudinary resource type
        file_ext = file.filename.rsplit('.', 1)[1].lower() if '.' in file.filename else ''
        
        if file_ext in ['mp4', 'mov', 'avi', 'mkv', 'webm', 'mp3', 'wav', 'ogg']:
            resource_type = 'video'
        elif file_ext in ['pdf', 'doc', 'docx', 'txt', 'xls', 'xlsx', 'ppt', 'pptx', 'zip']:
            resource_type = 'raw'
        else:
            resource_type = 'image'
        
        print(f"[UPLOAD] Resource type: {resource_type}")
        print(f"[UPLOAD] Uploading to Cloudinary...")
        
        # Secure filename
        filename = secure_filename(file.filename)
        
        # Upload to Cloudinary
        upload_result = cloudinary.uploader.upload(
            file,
            resource_type=resource_type,
            folder=f'course-materials/{course_id}',
            public_id=f"{datetime.utcnow().timestamp()}_{filename}",
            overwrite=False
        )
        
        cloudinary_url = upload_result['secure_url']
        public_id = upload_result['public_id']
        
        print(f"[UPLOAD] ✅ Uploaded to Cloudinary: {cloudinary_url}")
        section_id_raw = request.form.get('section_id')
        section_id = int(section_id_raw) if section_id_raw else None
        # Create database record with Cloudinary URL
        material = CourseMaterial(
            course_id=course_id,
            section_id=section_id,
            title=material_title,
            material_type=material_type,
            file_path=cloudinary_url,  # ✅ Store Cloudinary URL
            file_size=file_size,
            order=order,
            duration=int(duration) if duration else None
        )
        
        db.session.add(material)
        db.session.commit()
        
        print(f"✅ [UPLOAD] Material uploaded successfully with ID: {material.id}")
        print("📤"*35 + "\n")
        
        return jsonify({
            'message': 'Material uploaded successfully',
            'material': {
                'id': material.id,
                'course_id': course_id,
                'title': material.title,
                'type': material.material_type,
                'file_size': material.file_size,
                'file_url': cloudinary_url,
                'public_id': public_id,
                'order': material.order,
                'duration': material.duration,
                'created_at': material.created_at.isoformat()
            }
        }), 201
        
    except Exception as e:
        db.session.rollback()
        print(f"❌ [UPLOAD ERROR] Exception: {str(e)}")
        import traceback
        traceback.print_exc()
        print("📤"*35 + "\n")
        
        return jsonify({
            'error': 'Failed to upload material',
            'details': str(e)
        }), 500
# GET sections for a course
@app.route('/api/courses/<int:course_id>/sections', methods=['GET'])
def get_course_sections(course_id):
    try:
        course = Course.query.get(course_id)
        if not course:
            return jsonify({'error': 'Course not found'}), 404
        
        sections = CourseSection.query.filter_by(
            course_id=course_id
        ).order_by(CourseSection.order).all()
        
        sections_list = []
        for section in sections:
            materials = CourseMaterial.query.filter_by(
                section_id=section.id
            ).order_by(CourseMaterial.order).all()
            
            sections_list.append({
                'id': section.id,
                'title': section.title,
                'description': section.description,
                'order': section.order,
                'material_count': len(materials),
                'materials': [{
                    'id': m.id,
                    'title': m.title,
                    'type': m.material_type,
                    'file_path': m.file_path,
                    'file_size': m.file_size,
                    'duration': m.duration,
                    'order': m.order,
                } for m in materials]
            })
        
        return jsonify({'sections': sections_list}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# POST create a section
@app.route('/api/courses/<int:course_id>/sections', methods=['POST'])
@jwt_required()
def create_course_section(course_id):
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)
        
        if not user or user.user_type != 'tutor':
            return jsonify({'error': 'Only tutors can create sections'}), 403
        
        course = Course.query.get(course_id)
        if not course or course.tutor.user_id != user_id:
            return jsonify({'error': 'Course not found or not authorized'}), 404
        
        data = request.get_json()
        if not data.get('title'):
            return jsonify({'error': 'Section title is required'}), 400
        
        section = CourseSection(
            course_id=course_id,
            title=data['title'],
            description=data.get('description', ''),
            order=data.get('order', 0)
        )
        db.session.add(section)
        db.session.commit()
        
        return jsonify({
            'message': 'Section created successfully',
            'section': {
                'id': section.id,
                'title': section.title,
                'description': section.description,
                'order': section.order,
                'material_count': 0,
                'materials': []
            }
        }), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


# DELETE a section
@app.route('/api/sections/<int:section_id>', methods=['DELETE'])
@jwt_required()
def delete_section(section_id):
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)
        
        if not user or user.user_type != 'tutor':
            return jsonify({'error': 'Not authorized'}), 403
        
        section = CourseSection.query.get(section_id)
        if not section:
            return jsonify({'error': 'Section not found'}), 404
        
        if section.course.tutor.user_id != user_id:
            return jsonify({'error': 'Not authorized'}), 403
        
        db.session.delete(section)
        db.session.commit()
        return jsonify({'message': 'Section deleted'}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500
@app.route('/api/courses/<int:course_id>/materials', methods=['GET'])
def get_course_materials(course_id):
    """Get all materials for a course"""
    try:
        print(f"\n[MATERIALS] Fetching materials for course {course_id}")
        
        course = Course.query.get(course_id)
        
        if not course:
            print(f"[MATERIALS] Course {course_id} not found")
            return jsonify({'error': 'Course not found'}), 404
        
        materials = CourseMaterial.query.filter_by(course_id=course_id).order_by(CourseMaterial.order).all()
        
        print(f"[MATERIALS] Found {len(materials)} materials")
        
        materials_list = []
        for material in materials:
            material_data = {
                'id': material.id,
                'title': material.title,
                'type': material.material_type,
                'file_size': material.file_size,
                'order': material.order,
                'duration': material.duration,
                'created_at': material.created_at.isoformat()
            }
            materials_list.append(material_data)
            print(f"[MATERIALS] - {material.title} ({material.material_type})")
        
        response_data = {
            'course_id': course_id,
            'materials': materials_list,
            'total': len(materials_list)
        }
        
        print(f"[MATERIALS] Returning {len(materials_list)} materials\n")
        
        return jsonify(response_data), 200
        
    except Exception as e:
        print(f"[ERROR] Failed to get materials: {str(e)}")
        import traceback
        print(traceback.format_exc())
        return jsonify({'error': 'Failed to retrieve materials'}), 500
#================
# OFFLINE DOWNLOAD ENDPOINTS
# ============================================================================

@app.route('/api/courses/<int:course_id>/download', methods=['POST'])
@jwt_required()
def download_course_for_offline(course_id):
    """Record course download for offline access - ONLY for offline_available courses"""
    try:
        user_id_str = get_jwt_identity()
        user_id = int(user_id_str)
        user = User.query.get(user_id)
        
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        if user.user_type != 'student':
            return jsonify({'error': 'Only students can download courses'}), 403
        
        course = Course.query.get(course_id)
        
        if not course:
            return jsonify({'error': 'Course not found'}), 404
        
        # ✅ CRITICAL: Check if course is available for offline download
        if not course.offline_available:
            return jsonify({
                'error': 'This course is not available for offline download',
                'reason': 'Course is online-only'
            }), 403
        
        # Check if student is enrolled
        enrollment = Enrollment.query.filter_by(student_id=user_id, course_id=course_id).first()
        
        if not enrollment:
            return jsonify({'error': 'You must be enrolled in this course to download it'}), 403
        
        # Check if already downloaded
        existing_download = OfflineDownload.query.filter_by(
            user_id=user_id,
            course_id=course_id
        ).first()
        
        if existing_download:
            # Update expiration date
            existing_download.expires_at = datetime.utcnow() + timedelta(days=30)
            db.session.commit()
            
            return jsonify({
                'message': 'Course download refreshed',
                'expires_at': existing_download.expires_at.isoformat()
            }), 200
        
        # Create new download record
        expires_at = datetime.utcnow() + timedelta(days=30)
        
        download = OfflineDownload(
            user_id=user_id,
            course_id=course_id,
            expires_at=expires_at
        )
        
        db.session.add(download)
        db.session.commit()
        
        print(f"✅ [DOWNLOAD] Course {course_id} downloaded by user {user_id}")
        
        return jsonify({
            'message': 'Course marked for offline access',
            'course_id': course_id,
            'expires_at': expires_at.isoformat(),
            'note': 'Materials will be streamed from Cloudinary'
        }), 201
        
    except Exception as e:
        db.session.rollback()
        print(f"❌ [DOWNLOAD ERROR] {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Failed to download course'}), 500

@app.route('/api/student/downloads', methods=['GET'])
@jwt_required()
def get_user_downloads():
    """Get all offline downloads for the user"""
    try:
        user_id_str = get_jwt_identity()
        user_id = int(user_id_str)
        
        print(f"\n[DOWNLOADS] Fetching downloads for user {user_id}")
        
        downloads = OfflineDownload.query.filter_by(user_id=user_id).all()
        
        print(f"[DOWNLOADS] Found {len(downloads)} downloads")
        
        downloads_list = []
        for download in downloads:
            course = Course.query.get(download.course_id)
            
            if not course:
                print(f"[DOWNLOADS] Warning: Course {download.course_id} not found")
                continue
            
            # Check if expired
            is_expired = download.expires_at and download.expires_at < datetime.utcnow()
            
            downloads_list.append({
                'id': download.id,
                'course_id': course.id,
                'course_title': course.title,
                'downloaded_at': download.downloaded_at.isoformat(),
                'expires_at': download.expires_at.isoformat() if download.expires_at else None,
                'is_expired': is_expired
            })
            
            print(f"[DOWNLOADS] Added: {course.title} (expired: {is_expired})")
        
        print(f"[DOWNLOADS] Returning {len(downloads_list)} downloads\n")
        
        return jsonify({
            'downloads': downloads_list,
            'total': len(downloads_list)
        }), 200
        
    except Exception as e:
        print(f"[ERROR] Failed to get downloads: {str(e)}")
        import traceback
        print(traceback.format_exc())
        return jsonify({'error': 'Failed to retrieve downloads'}), 500
@app.route('/api/courses/<int:course_id>/download', methods=['DELETE'])
@jwt_required()
def remove_offline_download(course_id):
    """Remove offline download record"""
    try:
        user_id_str = get_jwt_identity()
        user_id = int(user_id_str)
        
        download = OfflineDownload.query.filter_by(
            user_id=user_id,
            course_id=course_id
        ).first()
        
        if not download:
            return jsonify({'error': 'Download not found'}), 404
        
        db.session.delete(download)
        db.session.commit()
        
        return jsonify({'message': 'Offline download removed'}), 200
        
    except Exception as e:
        db.session.rollback()
        print(f"[ERROR] Failed to remove download: {str(e)}")
        return jsonify({'error': 'Failed to remove download'}), 500


# ============================================================================
# COURSE ENDPOINTS
# ============================================================================




@app.route('/api/materials/<int:material_id>', methods=['DELETE'])
@jwt_required()
def delete_material(material_id):
    """Delete a course material from database and Cloudinary"""
    try:
        user_id_str = get_jwt_identity()
        user_id = int(user_id_str)
        user = User.query.get(user_id)
        
        if not user or user.user_type != 'tutor':
            return jsonify({'error': 'Only tutors can delete materials'}), 403
        
        material = CourseMaterial.query.get(material_id)
        
        if not material:
            return jsonify({'error': 'Material not found'}), 404
        
        # Check ownership
        if material.course.tutor.user_id != user.id:
            return jsonify({'error': 'Not authorized to delete this material'}), 403
        
        # ✅ Delete from Cloudinary
        try:
            # Extract public_id from Cloudinary URL
            # Example URL: https://res.cloudinary.com/xxx/video/upload/v123/course-materials/1/file.mp4
            file_path = material.file_path
            
            if 'cloudinary.com' in file_path:
                # Extract public_id from URL
                parts = file_path.split('/')
                # Find the upload index
                upload_index = parts.index('upload') if 'upload' in parts else -1
                if upload_index > 0 and upload_index < len(parts) - 1:
                    # Get everything after /upload/vXXX/
                    public_id_parts = parts[upload_index + 2:]  # Skip version number
                    public_id = '/'.join(public_id_parts)
                    # Remove file extension
                    public_id = public_id.rsplit('.', 1)[0]
                    
                    # Determine resource type
                    resource_type = 'raw'
                    if '/video/' in file_path:
                        resource_type = 'video'
                    elif '/image/' in file_path:
                        resource_type = 'image'
                    
                    print(f"[DELETE] Deleting from Cloudinary: {public_id} (type: {resource_type})")
                    
                    # Delete from Cloudinary
                    cloudinary.uploader.destroy(public_id, resource_type=resource_type)
                    print(f"✅ [DELETE] Deleted from Cloudinary")
        except Exception as cloudinary_error:
            print(f"⚠️ [DELETE] Cloudinary deletion failed (non-critical): {cloudinary_error}")
            # Continue with database deletion even if Cloudinary fails
        
        # Delete database record
        db.session.delete(material)
        db.session.commit()
        
        return jsonify({'message': 'Material deleted successfully'}), 200
        
    except Exception as e:
        db.session.rollback()
        print(f"[ERROR] Failed to delete material: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Failed to delete material'}), 500

@app.route('/api/courses/<int:course_id>', methods=['PUT'])
@jwt_required()
def update_course(course_id):
    """Update course details"""
    try:
        user_id_str = get_jwt_identity()
        user_id = int(user_id_str)
        user = User.query.get(user_id)
        
        if not user or user.user_type != 'tutor':
            return jsonify({'error': 'Only tutors can update courses'}), 403
        
        course = Course.query.get(course_id)
        
        if not course:
            return jsonify({'error': 'Course not found'}), 404
        
        # Check ownership
        if course.tutor.user_id != user.id:
            return jsonify({'error': 'Not authorized to update this course'}), 403
        
        data = request.get_json()
        
        # Update fields
        if 'title' in data:
            course.title = data['title'].strip()
        if 'description' in data:
            course.description = data['description'].strip()
        if 'category' in data:
            course.category = data['category']
        if 'level' in data:
            course.level = data['level']
        if 'duration' in data:
            course.duration = data['duration']
        if 'price' in data:
            course.price = float(data['price'])
        if 'offline_available' in data:
            course.offline_available = data['offline_available']
        if 'published' in data:
            course.published = data['published']
        
        db.session.commit()
        
        return jsonify({
            'message': 'Course updated successfully',
            'course': {
                'id': course.id,
                'title': course.title,
                'description': course.description,
                'category': course.category,
                'level': course.level,
                'duration': course.duration,
                'price': course.price,
                'offline_available': course.offline_available,
                'published': course.published
            }
        }), 200
        
    except Exception as e:
        db.session.rollback()
        print(f"[ERROR] Failed to update course: {str(e)}")
        return jsonify({'error': 'Failed to update course'}), 500


@app.route('/api/courses/<int:course_id>', methods=['DELETE'])
@jwt_required()
def delete_course(course_id):
    """Delete a course and all its materials"""
    try:
        user_id_str = get_jwt_identity()
        user_id = int(user_id_str)
        user = User.query.get(user_id)
        
        if not user or user.user_type != 'tutor':
            return jsonify({'error': 'Only tutors can delete courses'}), 403
        
        course = Course.query.get(course_id)
        
        if not course:
            return jsonify({'error': 'Course not found'}), 404
        
        # Check ownership
        if course.tutor.user_id != user.id:
            return jsonify({'error': 'Not authorized to delete this course'}), 403
        
        # Delete all course materials (files and database records)
        materials = CourseMaterial.query.filter_by(course_id=course_id).all()
        for material in materials:
            if os.path.exists(material.file_path):
                os.remove(material.file_path)
        
        # Delete course materials directory
        materials_dir = os.path.join(app.config['UPLOAD_FOLDER'], 'materials', str(course_id))
        if os.path.exists(materials_dir):
            import shutil
            shutil.rmtree(materials_dir)
        
        # Delete course (cascade will delete materials and enrollments)
        db.session.delete(course)
        db.session.commit()
        
        return jsonify({'message': 'Course deleted successfully'}), 200
        
    except Exception as e:
        db.session.rollback()
        print(f"[ERROR] Failed to delete course: {str(e)}")
        return jsonify({'error': 'Failed to delete course'}), 500

# Add these routes AFTER get_course_materials function

@app.route('/api/materials/<int:material_id>/stream', methods=['GET', 'OPTIONS'])
def stream_material(material_id):
    """Stream video/audio/document file from Cloudinary"""
    
    if request.method == 'OPTIONS':
        response = app.make_default_options_response()
        response.headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
        return response
    
    try:
        print(f"\n{'='*70}")
        print(f"[STREAM] Streaming material ID: {material_id}")
        print(f"{'='*70}")
        
        material = CourseMaterial.query.get(material_id)
        
        if not material:
            print(f"[STREAM ERROR] Material {material_id} not found in database")
            return jsonify({'error': 'Material not found'}), 404
        
        print(f"[STREAM] Material found: {material.title}")
        print(f"[STREAM] File URL: {material.file_path}")
        
        # ✅ Check if URL is from Cloudinary
        if 'cloudinary.com' in material.file_path:
            print(f"[STREAM] Redirecting to Cloudinary URL")
            # Redirect to Cloudinary URL (browser will stream directly)
            from flask import redirect
            return redirect(material.file_path, code=302)
        else:
            # Fallback for legacy local files (if any)
            print(f"[STREAM] Legacy local file detected")
            file_path = material.file_path
            
            if not os.path.isabs(file_path):
                file_path = os.path.join(os.getcwd(), file_path)
            
            if not os.path.exists(file_path):
                return jsonify({'error': 'File not found on server'}), 404
            
            file_ext = file_path.rsplit('.', 1)[1].lower() if '.' in file_path else ''
            
            mime_types = {
                'mp4': 'video/mp4',
                'webm': 'video/webm',
                'mov': 'video/quicktime',
                'mp3': 'audio/mpeg',
                'pdf': 'application/pdf',
                'jpg': 'image/jpeg',
                'png': 'image/png',
            }
            
            mimetype = mime_types.get(file_ext, 'application/octet-stream')
            
            response = send_file(file_path, mimetype=mimetype, as_attachment=False)
            return response
        
    except Exception as e:
        print(f"❌ [STREAM ERROR] Exception: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Failed to stream material', 'details': str(e)}), 500

@app.route('/api/materials/<int:material_id>/download', methods=['GET', 'OPTIONS'])
def download_material(material_id):
    """Download material file"""
    
    if request.method == 'OPTIONS':
        response = app.make_default_options_response()
        
        return response
    
    try:
        print(f"\n[DOWNLOAD] Downloading material ID: {material_id}")
        
        material = CourseMaterial.query.get(material_id)
        
        if not material:
            return jsonify({'error': 'Material not found'}), 404
        
        # Make sure path is absolute
        file_path = material.file_path
        if not os.path.isabs(file_path):
            file_path = os.path.join(os.getcwd(), file_path)
        
        if not os.path.exists(file_path):
            return jsonify({'error': 'File not found on server'}), 404
        
        file_ext = file_path.rsplit('.', 1)[1] if '.' in file_path else 'file'
        
        response = send_file(
            file_path,
            as_attachment=True,
            download_name=f"{material.title}.{file_ext}"
        )
        
        
        
        print(f"✅ [DOWNLOAD] File sent successfully")
        
        return response
        
    except Exception as e:
        print(f"❌ [DOWNLOAD ERROR] {str(e)}")
        import traceback
        print(traceback.format_exc())
        return jsonify({'error': 'Failed to download material'}), 500
@app.route('/api/tutor/courses', methods=['GET'])
@jwt_required()
def get_tutor_courses():
    """Get all courses created by the tutor"""
    try:
        user_id_str = get_jwt_identity()
        user_id = int(user_id_str)
        user = User.query.get(user_id)
        
        if not user or user.user_type != 'tutor':
            return jsonify({'error': 'Only tutors can access this endpoint'}), 403
        
        tutor_profile = user.tutor_profile
        if not tutor_profile:
            return jsonify({'courses': []}), 200
        
        courses = Course.query.filter_by(tutor_id=tutor_profile.id).all()
        
        courses_list = []
        for course in courses:
            material_count = CourseMaterial.query.filter_by(course_id=course.id).count()
            
            courses_list.append({
                'id': course.id,
                'title': course.title,
                'description': course.description,
                'category': course.category,
                'level': course.level,
                'duration': course.duration,
                'price': course.price,
                'rating': course.rating,
                'total_students': course.total_students,
                'offline_available': course.offline_available,
                'published': course.published,
                'material_count': material_count,
                'created_at': course.created_at.isoformat()
            })
        
        return jsonify({
            'courses': courses_list,
            'total': len(courses_list)
        }), 200
        
    except Exception as e:
        print(f"[ERROR] Failed to get tutor courses: {str(e)}")
        return jsonify({'error': 'Failed to retrieve courses'}), 500
# ============================================================================
# TUTOR ENDPOINTS
# ============================================================================
@app.route('/api/tutor/profile', methods=['GET'])
@jwt_required()
def get_tutor_profile_enhanced():
    """Get enhanced tutor profile with all details"""
    user_id_str = get_jwt_identity()
    user_id = int(user_id_str)
    user = User.query.get(user_id)
    
    if not user or user.user_type != 'tutor':
        return jsonify({'error': 'Not authorized'}), 403
    
    profile = user.tutor_profile
    
    if not profile:
        return jsonify({'profile': None}), 200
    
    return jsonify({
        'profile': {
            'id': profile.id,
            # Basic info
            'expertise': json.loads(profile.expertise or '[]'),
            'bio': profile.bio or '',
            'hourly_rate': profile.hourly_rate or 0,
            'rating': profile.rating,
            'total_sessions': profile.total_sessions,
            'languages': json.loads(profile.languages or '[]'),
            'availability': json.loads(profile.availability or '{}'),
            'verified': profile.verified,
            
            # Additional fields (using getattr for safety)
            'teaching_style': getattr(profile, 'teaching_style', 'adaptive'),
            'years_experience': getattr(profile, 'years_experience', ''),
            'education': getattr(profile, 'education', ''),
            'gender': getattr(user, 'gender', ''),
            'certifications': getattr(profile, 'certifications', ''),
            'specializations': getattr(profile, 'specializations', ''),
            'teaching_philosophy': getattr(profile, 'teaching_philosophy', ''),
            'min_session_length': getattr(profile, 'min_session_length', '30'),
            'max_students': getattr(profile, 'max_students', '10'),
            'preferred_age_groups': json.loads(getattr(profile, 'preferred_age_groups', '[]') or '[]')
        }
    }), 200


@app.route('/api/tutor/profile', methods=['PUT'])
@jwt_required()
def update_tutor_profile_enhanced():
    """Update enhanced tutor profile with partial save support"""
    print("\n📝 [TUTOR PROFILE UPDATE] Updating tutor profile")
    
    user_id_str = get_jwt_identity()
    user_id = int(user_id_str)
    user = User.query.get(user_id)
    
    if not user or user.user_type != 'tutor':
        return jsonify({'error': 'Not authorized'}), 403
    
    data = request.json
    print(f"📦 [TUTOR PROFILE] Received data keys: {list(data.keys())}")
    
    profile = user.tutor_profile
    if not profile:
        profile = TutorProfile(user_id=user.id)
        db.session.add(profile)
        db.session.flush()
        print("  🆕 Created new tutor profile")
    
    # Update all provided fields (partial updates supported)
    if 'expertise' in data:
        profile.expertise = json.dumps(data['expertise'])
        print(f"  📚 Updated expertise: {len(data['expertise'])} items")
        
    if 'bio' in data:
        profile.bio = data['bio']
        print(f"  📝 Updated bio: {len(data['bio'])} chars")
        
    if 'hourly_rate' in data:
        profile.hourly_rate = float(data['hourly_rate'])
        print(f"  💰 Updated hourly_rate: ${data['hourly_rate']}")
        
    if 'languages' in data:
        profile.languages = json.dumps(data['languages'])
        print(f"  🌍 Updated languages: {data['languages']}")
        
    if 'availability' in data:
        profile.availability = json.dumps(data['availability'])
        print(f"  📅 Updated availability: {sum(data['availability'].values())} slots")
    if 'gender' in data:
        user.gender = data['gender']
    # Additional fields - using setattr for safety
    additional_fields = [
        'teaching_style', 'years_experience', 'education', 'certifications',
        'specializations', 'teaching_philosophy', 'min_session_length', 
        'max_students'
    ]
    
    for field in additional_fields:
        if field in data:
            if hasattr(profile, field):
                setattr(profile, field, data[field])
                print(f"  ✅ Updated {field}")
            else:
                print(f"  ⚠️ WARNING: '{field}' column doesn't exist in TutorProfile model")
    
    # Handle preferred_age_groups separately (JSON field)
    if 'preferred_age_groups' in data:
        if hasattr(profile, 'preferred_age_groups'):
            profile.preferred_age_groups = json.dumps(data['preferred_age_groups'])
            print(f"  👥 Updated preferred_age_groups")
        else:
            print(f"  ⚠️ WARNING: 'preferred_age_groups' column doesn't exist")
    
    # Check if profile is complete (all required fields filled)
    is_complete = all([
        profile.bio and len(profile.bio) >= 20,
        profile.expertise and len(json.loads(profile.expertise)) > 0,
        profile.hourly_rate and profile.hourly_rate > 0,
        profile.languages and len(json.loads(profile.languages)) > 0,
        getattr(profile, 'years_experience', ''),
        getattr(profile, 'education', ''),
        profile.availability and any(json.loads(profile.availability).values())
    ])
    
    # Mark as verified if complete
    if is_complete:
        profile.verified = True
        print("✅ [TUTOR PROFILE] Profile is COMPLETE, marking as verified")
    else:
        profile.verified = False
        print("⚠️ [TUTOR PROFILE] Profile INCOMPLETE, saving progress")
    
    try:
        db.session.commit()
        print("✅ [TUTOR PROFILE UPDATE] Profile committed to database successfully")
    except Exception as e:
        db.session.rollback()
        print(f"❌ [TUTOR PROFILE ERROR] Database commit failed: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': f'Failed to save profile: {str(e)}'}), 500
    
    # Return the updated profile data
    return jsonify({
        'message': 'Profile updated successfully',
        'profile_complete': is_complete,
        'verified': profile.verified,
        'profile': {
            'bio': profile.bio,
            'expertise': json.loads(profile.expertise or '[]'),
            'hourly_rate': profile.hourly_rate,
            'languages': json.loads(profile.languages or '[]'),
            'availability': json.loads(profile.availability or '{}'),
            'teaching_style': getattr(profile, 'teaching_style', 'adaptive'),
            'years_experience': getattr(profile, 'years_experience', ''),
            'education': getattr(profile, 'education', ''),
            'certifications': getattr(profile, 'certifications', ''),
            'specializations': getattr(profile, 'specializations', ''),
            'teaching_philosophy': getattr(profile, 'teaching_philosophy', ''),
            'min_session_length': getattr(profile, 'min_session_length', '30'),
            'max_students': getattr(profile, 'max_students', '10'),
            'preferred_age_groups': json.loads(getattr(profile, 'preferred_age_groups', '[]') or '[]'),
            'rating': profile.rating,
            'total_sessions': profile.total_sessions,
            'verified': profile.verified
        }
    }), 200

@app.route('/api/user/info', methods=['GET'])
@jwt_required()
def get_user_info():
    """Get current user's basic information"""
    try:
        user_id_str = get_jwt_identity()
        user_id = int(user_id_str)
        user = User.query.get(user_id)
        
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        return jsonify({
            'user': {
                'id': user.id,
                'email': user.email,
                'full_name': user.full_name,
                'user_type': user.user_type,
                # Fixed: Return actual phone and location fields
                'phone': getattr(user, 'phone', ''),
                'location': getattr(user, 'location', ''),
                'date_of_birth': getattr(user, 'date_of_birth', ''),
                'created_at': user.created_at.isoformat()
            }
        }), 200
        
    except Exception as e:
        print(f"❌ [USER INFO ERROR] {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Failed to get user info'}), 500


@app.route('/api/user/update', methods=['PUT'])
@jwt_required()
def update_user_info():
    """Update user's basic information"""
    try:
        user_id_str = get_jwt_identity()
        user_id = int(user_id_str)
        user = User.query.get(user_id)
        
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        data = request.get_json()
        print(f"📦 [USER UPDATE] Received data: {data}")
        
        # Update allowed fields
        if 'full_name' in data:
            user.full_name = data['full_name']
            print(f"  ✏️ Updated full_name: {data['full_name']}")
        
        # Update phone, location, date_of_birth using setattr (safe if column doesn't exist)
        if 'phone' in data:
            if hasattr(user, 'phone'):
                user.phone = data['phone']
                print(f"  📞 Updated phone: {data['phone']}")
            else:
                print("  ⚠️ WARNING: 'phone' column doesn't exist in User model")
                
        if 'location' in data:
            if hasattr(user, 'location'):
                user.location = data['location']
                print(f"  📍 Updated location: {data['location']}")
            else:
                print("  ⚠️ WARNING: 'location' column doesn't exist in User model")
                
        if 'date_of_birth' in data:
            if hasattr(user, 'date_of_birth'):
                dob = data.get('date_of_birth')

                user.date_of_birth = (
                    datetime.strptime(dob, '%Y-%m-%d').date()
                    if dob else None
                )

                print(f"  🎂 Updated date_of_birth: {user.date_of_birth}")

        
        db.session.commit()
        print("✅ [USER UPDATE] User info committed to database")
        
        return jsonify({
            'message': 'User info updated successfully',
            'user': {
                'full_name': user.full_name,
                'phone': getattr(user, 'phone', ''),
                'location': getattr(user, 'location', ''),
                'date_of_birth': getattr(user, 'date_of_birth', '')
            }
        }), 200
        
    except Exception as e:
        db.session.rollback()
        print(f"❌ [USER UPDATE ERROR] {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': f'Failed to update user info: {str(e)}'}), 500


@app.route('/api/tutors', methods=['GET'])
def get_all_tutors():
    """Get all verified tutors"""
    try:
        print("\n[TUTORS] Fetching all tutors...")
        
        # Get all verified tutors with explicit join
        tutors = db.session.query(TutorProfile).join(User).filter(
            TutorProfile.verified == True
        ).all()
        
        print(f"[TUTORS] Found {len(tutors)} verified tutors")
        
        tutors_list = []
        for tutor in tutors:
            user = User.query.get(tutor.user_id)
            
            if not user:
                print(f"[TUTORS] WARNING: No user found for tutor {tutor.id}")
                continue
            
            tutors_list.append({
                'id': tutor.id,
                'user_id': tutor.user_id,
                'name': user.full_name,
                'expertise': json.loads(tutor.expertise or '[]'),
                'bio': tutor.bio,
                'hourly_rate': tutor.hourly_rate,
                'rating': tutor.rating,
                'total_sessions': tutor.total_sessions,
                'languages': json.loads(tutor.languages or '[]'),
                'verified': tutor.verified,
                'gender': getattr(user, 'gender', ''),
            })
            
            print(f"[TUTORS] Added: {user.full_name}")
        
        print(f"[TUTORS] Returning {len(tutors_list)} tutors\n")
        
        return jsonify({'tutors': tutors_list}), 200
        
    except Exception as e:
        print(f"[TUTORS ERROR] {str(e)}")
        import traceback
        print(traceback.format_exc())
        return jsonify({'error': 'Failed to fetch tutors'}), 500
# ============================================================================
# COURSE ENDPOINTS
# ============================================================================

@app.route('/api/courses', methods=['GET'])
def get_courses():
    """Get all published courses"""
    courses = Course.query.filter_by(published=True).all()
    
    courses_list = []
    for course in courses:
        tutor_name = course.tutor.user.full_name if course.tutor else 'Unknown'
        courses_list.append({
            'id': course.id,
            'title': course.title,
            'description': course.description,
            'category': course.category,
            'level': course.level,
            'duration': course.duration,
            'price': course.price,
            'rating': course.rating,
            'total_students': course.total_students,
            'tutor_name': tutor_name,
            'offline_available': course.offline_available
        })
    
    return jsonify({'courses': courses_list}), 200


@app.route('/api/courses/<int:course_id>/generate-certificates', methods=['POST'])
@jwt_required()
def generate_certificates_for_course(course_id):
    """Generate certificates for all students who completed a course"""
    try:
        user_id_str = get_jwt_identity()
        user_id = int(user_id_str)
        user = User.query.get(user_id)
        
        if not user or user.user_type != 'tutor':
            return jsonify({'error': 'Only tutors can generate certificates'}), 403
        
        course = Course.query.get(course_id)
        if not course:
            return jsonify({'error': 'Course not found'}), 404
        
        # Check ownership
        if course.tutor.user_id != user.id:
            return jsonify({'error': 'Not authorized'}), 403
        
        # Get all completed enrollments
        completed_enrollments = Enrollment.query.filter_by(
            course_id=course_id,
            completed=True,
            certificate_issued=False
        ).all()
        
        certificates_generated = []
        
        for enrollment in completed_enrollments:
            # Generate certificate PDF
            cert_id = f"CERT-{course_id}-{enrollment.student_id}-{datetime.utcnow().timestamp()}"
            
            # Mark as issued
            enrollment.certificate_issued = True
            
            certificates_generated.append({
                'student_name': enrollment.student.full_name,
                'certificate_id': cert_id
            })
        
        db.session.commit()
        
        return jsonify({
            'message': f'Generated {len(certificates_generated)} certificates',
            'certificates': certificates_generated
        }), 200
        
    except Exception as e:
        db.session.rollback()
        print(f"[CERT ERROR] {str(e)}")
        return jsonify({'error': 'Failed to generate certificates'}), 500


@app.route('/api/certificates/<certificate_id>/download', methods=['GET'])
@jwt_required()
def download_certificate(certificate_id):
    """Download a certificate PDF"""
    try:
        # Create PDF in memory
        buffer = io.BytesIO()
        
        # Create the PDF document
        doc = SimpleDocTemplate(buffer, pagesize=A4)
        story = []
        styles = getSampleStyleSheet()
        
        # Title
        title_style = ParagraphStyle(
            'CertTitle',
            parent=styles['Heading1'],
            fontSize=36,
            textColor=colors.HexColor('#1e40af'),
            spaceAfter=30,
            alignment=TA_CENTER
        )
        
        story.append(Paragraph("Certificate of Completion", title_style))
        story.append(Spacer(1, 0.5*inch))
        
        # Student name (you'd get this from database)
        story.append(Paragraph("This certifies that", styles['Normal']))
        story.append(Spacer(1, 0.2*inch))
        story.append(Paragraph("<b>Student Name</b>", title_style))
        story.append(Spacer(1, 0.2*inch))
        
        # Course name
        story.append(Paragraph("has successfully completed", styles['Normal']))
        story.append(Spacer(1, 0.2*inch))
        story.append(Paragraph("<b>Course Title</b>", title_style))
        
        # Build PDF
        doc.build(story)
        
        # Return PDF
        buffer.seek(0)
        return send_file(
            buffer,
            mimetype='application/pdf',
            as_attachment=True,
            download_name=f'{certificate_id}.pdf'
        )
        
    except Exception as e:
        print(f"[CERT DOWNLOAD ERROR] {str(e)}")
        return jsonify({'error': 'Failed to download certificate'}), 500
@app.route('/api/courses/<int:course_id>', methods=['GET'])
def get_course(course_id):
    """Get single course details"""
    course = Course.query.get(course_id)
    
    if not course:
        return jsonify({'error': 'Course not found'}), 404
    
    tutor_name = course.tutor.user.full_name if course.tutor else 'Unknown'
    
    return jsonify({
        'course': {
            'id': course.id,
            'title': course.title,
            'description': course.description,
            'category': course.category,
            'level': course.level,
            'duration': course.duration,
            'price': course.price,
            'rating': course.rating,
            'total_students': course.total_students,
            'tutor_name': tutor_name,
            'offline_available': course.offline_available,
            'created_at': course.created_at.isoformat()
        }
    }), 200

@app.route('/api/courses/<int:course_id>/enroll', methods=['POST'])
@jwt_required()
def enroll_in_course(course_id):
    """Enroll student in a course"""
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    
    if not user or user.user_type != 'student':
        return jsonify({'error': 'Only students can enroll'}), 403
    
    course = Course.query.get(course_id)
    if not course:
        return jsonify({'error': 'Course not found'}), 404
    
    # Check if already enrolled
    existing = Enrollment.query.filter_by(
        student_id=user_id,
        course_id=course_id
    ).first()
    
    if existing:
        return jsonify({'error': 'Already enrolled'}), 400
    
    enrollment = Enrollment(
        student_id=user_id,
        course_id=course_id
    )
    
    course.total_students += 1
    
    db.session.add(enrollment)
    db.session.commit()
    
    return jsonify({'message': 'Enrolled successfully'}), 201
@app.route('/api/debug/tutors', methods=['GET'])
def debug_tutors():
    """Debug endpoint to check tutor-user relationships"""
    tutors = TutorProfile.query.all()
    
    debug_info = []
    for tutor in tutors:
        user = User.query.get(tutor.user_id) if tutor.user_id else None
        debug_info.append({
            'tutor_id': tutor.id,
            'user_id': tutor.user_id,
            'user_exists': user is not None,
            'user_name': user.full_name if user else 'NO USER',
            'verified': tutor.verified
        })
    
    return jsonify({'tutors': debug_info}), 200
@app.route('/api/courses/create', methods=['POST', 'OPTIONS'], endpoint = "courses_create")
@jwt_required()
def create_course():
    """Create a new course (tutor only)"""
    
    if request.method == 'OPTIONS':
        return '', 200
    
    try:
        print("\n" + "📚"*35)
        print("📚 COURSE CREATION ENDPOINT HIT!")
        print("📚"*35)
        
        # Get and validate user
        user_id_str = get_jwt_identity()
        if not user_id_str:
            return jsonify({'error': 'Authentication required'}), 401
        
        user_id = int(user_id_str)
        user = User.query.get(user_id)
        
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        if user.user_type != 'tutor':
            return jsonify({'error': 'Only tutors can create courses'}), 403
        
        # Get tutor profile
        tutor_profile = user.tutor_profile
        if not tutor_profile:
            return jsonify({'error': 'Tutor profile not found'}), 404
        
        print(f"[COURSE] Creating course for tutor: {user.full_name} (ID: {tutor_profile.id})")
        
        # Get request data
        data = request.get_json()
        print(f"[COURSE] Received data: {json.dumps(data, indent=2)}")
        
        # Validate required fields
        required_fields = ['title', 'description', 'category', 'level']
        missing_fields = [field for field in required_fields if field not in data or not data[field]]
        
        if missing_fields:
            return jsonify({
                'error': 'Missing required fields',
                'missing': missing_fields
            }), 400
        
        # Create course
        course = Course(
            tutor_id=tutor_profile.id,
            title=data['title'].strip(),
            description=data['description'].strip(),
            category=data['category'],
            level=data['level'],
            duration=data.get('duration', ''),
            price=float(data.get('price', 0.0)),
            offline_available=data.get('offline_available', False),
            published=data.get('published', False)
        )
        
        db.session.add(course)
        db.session.commit()
        
        print(f"✅ [COURSE] Course created successfully with ID: {course.id}")
        print("📚"*35 + "\n")
        
        return jsonify({
            'message': 'Course created successfully',
            'course': {
                'id': course.id,
                'title': course.title,
                'description': course.description,
                'category': course.category,
                'level': course.level,
                'duration': course.duration,
                'price': course.price,
                'offline_available': course.offline_available,
                'published': course.published,
                'created_at': course.created_at.isoformat()
            }
        }), 201
        
    except ValueError as e:
        print(f"❌ [COURSE ERROR] Validation error: {str(e)}")
        return jsonify({'error': f'Invalid data: {str(e)}'}), 400
    
    except Exception as e:
        db.session.rollback()
        print(f"❌ [COURSE ERROR] Exception: {str(e)}")
        import traceback
        print(traceback.format_exc())
        print("📚"*35 + "\n")
        
        return jsonify({
            'error': 'Failed to create course',
            'details': str(e)
        }), 500
@app.route('/api/debug/users-and-tutors', methods=['GET'])
def debug_users_and_tutors():
    """Comprehensive debug endpoint"""
    try:
        # Get all users
        all_users = User.query.all()
        users_info = []
        for user in all_users:
            users_info.append({
                'id': user.id,
                'email': user.email,
                'full_name': user.full_name,
                'user_type': user.user_type,
                'has_tutor_profile': user.tutor_profile is not None,
                'has_student_profile': user.student_profile is not None,
                'tutor_profile_id': user.tutor_profile.id if user.tutor_profile else None,
                'student_profile_id': user.student_profile.id if user.student_profile else None
            })
        
        # Get all tutor profiles
        all_tutors = TutorProfile.query.all()
        tutors_info = []
        for tutor in all_tutors:
            # Try to get user through relationship
            user_via_relationship = tutor.user
            # Try to get user directly
            user_via_query = User.query.get(tutor.user_id) if tutor.user_id else None
            
            tutors_info.append({
                'tutor_profile_id': tutor.id,
                'user_id_field': tutor.user_id,
                'verified': tutor.verified,
                'user_via_relationship': {
                    'exists': user_via_relationship is not None,
                    'id': user_via_relationship.id if user_via_relationship else None,
                    'name': user_via_relationship.full_name if user_via_relationship else None
                },
                'user_via_query': {
                    'exists': user_via_query is not None,
                    'id': user_via_query.id if user_via_query else None,
                    'name': user_via_query.full_name if user_via_query else None
                }
            })
        
        return jsonify({
            'users': users_info,
            'tutors': tutors_info,
            'total_users': len(users_info),
            'total_tutors': len(tutors_info)
        }), 200
        
    except Exception as e:
        print(f"[DEBUG ERROR] {str(e)}")
        import traceback
        print(traceback.format_exc())
        return jsonify({'error': str(e)}), 500


@app.route('/api/debug/user/<int:user_id>', methods=['GET'])
def debug_get_user(user_id):
    """Check if a specific user exists"""
    try:
        user = User.query.get(user_id)
        
        if not user:
            return jsonify({
                'exists': False,
                'message': f'User {user_id} does not exist',
                'user_id': user_id
            }), 404
        
        return jsonify({
            'exists': True,
            'user': {
                'id': user.id,
                'email': user.email,
                'full_name': user.full_name,
                'user_type': user.user_type,
                'has_tutor_profile': user.tutor_profile is not None,
                'has_student_profile': user.student_profile is not None,
                'tutor_profile_id': user.tutor_profile.id if user.tutor_profile else None,
                'student_profile_id': user.student_profile.id if user.student_profile else None
            }
        }), 200
        
    except Exception as e:
        print(f"[DEBUG ERROR] {str(e)}")
        return jsonify({'error': str(e)}), 500
# Add these endpoints to your app.py file (around line 900, after other debug endpoints)

@app.route('/api/debug/verify-all-tutors', methods=['POST'])
def verify_all_tutors():
    """Manually verify all tutors (for testing)"""
    try:
        tutors = TutorProfile.query.all()
        count = 0
        
        for tutor in tutors:
            if not tutor.verified:
                tutor.verified = True
                count += 1
                print(f"✅ Verified tutor {tutor.id}")
        
        db.session.commit()
        
        return jsonify({
            'message': f'Verified {count} tutors',
            'total_tutors': len(tutors)
        }), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@app.route('/api/debug/tutor-status', methods=['GET'])
def debug_tutor_status():
    """Check the status of all tutors"""
    try:
        tutors = TutorProfile.query.all()
        
        status = []
        for tutor in tutors:
            user = User.query.get(tutor.user_id)
            status.append({
                'tutor_id': tutor.id,
                'user_id': tutor.user_id,
                'name': user.full_name if user else 'NO USER',
                'email': user.email if user else 'NO EMAIL',
                'verified': tutor.verified,
                'verified_type': str(type(tutor.verified)),
                'has_expertise': bool(tutor.expertise),
                'has_bio': bool(tutor.bio),
                'created_at': user.created_at.isoformat() if user else None,
                'rating': tutor.rating, 
            })
        
        return jsonify({
            'total_tutors': len(status),
            'verified_count': sum(1 for t in status if t['verified']),
            'tutors': status
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500













###############################################################################
@app.route('/api/tutor/assignments/<int:assignment_id>/submissions', methods=['GET'])
@jwt_required()
def get_assignment_submissions(assignment_id):
    """Get all submissions for an assignment"""
    try:
        user_id_str = get_jwt_identity()
        user_id = int(user_id_str)
        user = User.query.get(user_id)
        
        if not user or user.user_type != 'tutor':
            return jsonify({'error': 'Only tutors can view submissions'}), 403
        
        assignment = Assignment.query.get(assignment_id)
        if not assignment:
            return jsonify({'error': 'Assignment not found'}), 404
        
        # Check ownership
        if assignment.tutor.user_id != user_id:
            return jsonify({'error': 'Not authorized'}), 403
        
        submissions = AssignmentSubmission.query.filter_by(
            assignment_id=assignment_id
        ).order_by(AssignmentSubmission.submitted_at.desc()).all()
        
        submissions_list = []
        for submission in submissions:
            student = User.query.get(submission.student_id)
            
            submissions_list.append({
                'id': submission.id,
                'assignment_id': assignment_id,
                'student_id': submission.student_id,
                'student_name': student.full_name if student else 'Unknown',
                'submitted_at': submission.submitted_at.isoformat(),
                'status': submission.status,
                'score': submission.score,
                'max_score': assignment.max_score,
                'grade': submission.grade,
                'feedback': submission.feedback,
                'comments': submission.comments,
                'files': json.loads(submission.files) if submission.files else [],
                'late_submission': submission.late_submission
            })
        
        return jsonify({'submissions': submissions_list}), 200
        
    except Exception as e:
        print(f"❌ [SUBMISSIONS ERROR] {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Failed to get submissions'}), 500
    
###########################################################################################

@app.route('/api/create-test-assignment', methods=['POST'])
@jwt_required()
def create_test_assignment():
    """Create a test assignment for grading testing"""
    try:
        user_id_str = get_jwt_identity()
        user_id = int(user_id_str)
        user = User.query.get(user_id)
        
        if not user or user.user_type != 'tutor':
            return jsonify({'error': 'Only tutors can create assignments'}), 403
        
        # Get the tutor profile
        tutor = TutorProfile.query.filter_by(user_id=user_id).first()
        if not tutor:
            return jsonify({'error': 'Tutor profile not found'}), 404
        
        # Get first available course
        course = Course.query.filter_by(tutor_id=tutor.id).first()
        if not course:
            # If no course exists, create a test course
            course = Course(
                tutor_id=tutor.id,
                name="Test Course - Python Programming",
                description="Test course for assignment grading",
                category="Programming",
                level="Beginner"
            )
            db.session.add(course)
            db.session.commit()
        
        # Create test assignment
        assignment = Assignment(
            tutor_id=tutor.id,
            course_id=course.id,
            title="Test Assignment: Essay on Python Programming",
            description="Write a 500-word essay about the benefits of Python programming. Include examples of real-world applications.",
            due_date=datetime.now() + timedelta(days=7),
            max_score=100
        )
        
        db.session.add(assignment)
        db.session.commit()
        
        return jsonify({
            'message': 'Test assignment created successfully',
            'assignment': {
                'id': assignment.id,
                'title': assignment.title,
                'course_name': course.name
            }
        }), 201
        
    except Exception as e:
        print(f"❌ [TEST ASSIGNMENT ERROR] {str(e)}")
        import traceback
        traceback.print_exc()
        db.session.rollback()
        return jsonify({'error': 'Failed to create test assignment'}), 500


@app.route('/api/tutor/assignments', methods=['GET'])
@jwt_required()
def get_tutor_assignments():
    """Get all assignments created by the tutor"""
    try:
        user_id_str = get_jwt_identity()
        user_id = int(user_id_str)
        user = User.query.get(user_id)
        
        if not user or user.user_type != 'tutor':
            return jsonify({'error': 'Only tutors can view assignments'}), 403
        
        tutor = TutorProfile.query.filter_by(user_id=user_id).first()
        if not tutor:
            return jsonify({'error': 'Tutor profile not found'}), 404
        
        assignments = Assignment.query.filter_by(tutor_id=tutor.id).all()
        
        assignments_list = []
        for assignment in assignments:
            # Count submissions
            submissions_count = AssignmentSubmission.query.filter_by(
                assignment_id=assignment.id
            ).count()
            
            # Count graded submissions
            graded_count = AssignmentSubmission.query.filter_by(
                assignment_id=assignment.id,
                status='graded'
            ).count()
            
            assignments_list.append({
                'id': assignment.id,
                'title': assignment.title,
                'description': assignment.description,
                'due_date': assignment.due_date.isoformat(),
                'max_score': assignment.max_score,
                'created_at': assignment.created_at.isoformat(),
                'submissions_count': submissions_count,
                'graded_count': graded_count,
                'course_name': assignment.course.title if assignment.course else 'No Course'  # ✅ FIXED: Use 'title' instead of 'name'
            })
        
        return jsonify({'assignments': assignments_list}), 200
        
    except Exception as e:
        print(f"❌ [TUTOR ASSIGNMENTS ERROR] {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Failed to get assignments'}), 500



# ============================================================================
# INITIALIZE DATABASE
# ============================================================================


    


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 10000))
    socketio.run(
        app,
        host='0.0.0.0',
        port=port,
        debug=False,
        allow_unsafe_werkzeug=True
    )
