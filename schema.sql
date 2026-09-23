--
-- PostgreSQL database dump
--

\restrict vxVEXHnnvegYhKGED4IEFfbJy4Asb15hAUmZqF8w3lHvBhnel82lvhenpDkFTOJ

-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: alembic_version; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.alembic_version (
    version_num character varying(32) NOT NULL
);


--
-- Name: assignment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assignment (
    id integer NOT NULL,
    tutor_id integer NOT NULL,
    course_id integer,
    title character varying(200) NOT NULL,
    description text,
    due_date timestamp without time zone NOT NULL,
    max_score integer,
    created_at timestamp without time zone
);


--
-- Name: assignment_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.assignment_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: assignment_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.assignment_id_seq OWNED BY public.assignment.id;


--
-- Name: assignment_submission; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assignment_submission (
    id integer NOT NULL,
    assignment_id integer NOT NULL,
    student_id integer NOT NULL,
    submitted_at timestamp without time zone,
    status character varying(20),
    score integer,
    grade character varying(5),
    feedback text,
    comments text,
    files text,
    rubric_scores text,
    late_submission boolean
);


--
-- Name: assignment_submission_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.assignment_submission_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: assignment_submission_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.assignment_submission_id_seq OWNED BY public.assignment_submission.id;


--
-- Name: booking; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.booking (
    id integer NOT NULL,
    tutor_id integer,
    student_id integer,
    subject character varying(100),
    date character varying(20),
    "time" character varying(20),
    duration integer,
    status character varying(20),
    notes character varying(500)
);


--
-- Name: booking_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.booking_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: booking_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.booking_id_seq OWNED BY public.booking.id;


--
-- Name: conversation; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversation (
    id integer NOT NULL,
    participant1_id integer,
    participant2_id integer,
    last_message character varying(500),
    last_message_time timestamp without time zone
);


--
-- Name: conversation_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.conversation_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: conversation_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.conversation_id_seq OWNED BY public.conversation.id;


--
-- Name: course; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.course (
    id integer NOT NULL,
    tutor_id integer NOT NULL,
    title character varying(200) NOT NULL,
    description text,
    category character varying(50),
    level character varying(50),
    duration character varying(50),
    price double precision,
    rating double precision,
    total_students integer,
    offline_available boolean,
    published boolean,
    created_at timestamp without time zone
);


--
-- Name: course_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.course_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: course_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.course_id_seq OWNED BY public.course.id;


--
-- Name: course_material; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.course_material (
    id integer NOT NULL,
    course_id integer NOT NULL,
    title character varying(200) NOT NULL,
    material_type character varying(50),
    file_path character varying(500),
    file_size integer,
    "order" integer,
    duration integer,
    created_at timestamp without time zone,
    section_id integer
);


--
-- Name: course_material_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.course_material_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: course_material_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.course_material_id_seq OWNED BY public.course_material.id;


--
-- Name: course_section; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.course_section (
    id integer NOT NULL,
    course_id integer NOT NULL,
    title character varying(200) NOT NULL,
    description text,
    "order" integer,
    created_at timestamp without time zone
);


--
-- Name: course_section_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.course_section_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: course_section_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.course_section_id_seq OWNED BY public.course_section.id;


--
-- Name: enrollment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.enrollment (
    id integer NOT NULL,
    student_id integer NOT NULL,
    course_id integer NOT NULL,
    enrolled_at timestamp without time zone,
    progress double precision,
    completed boolean,
    certificate_issued boolean
);


--
-- Name: enrollment_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.enrollment_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: enrollment_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.enrollment_id_seq OWNED BY public.enrollment.id;


--
-- Name: fcm_token; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fcm_token (
    id integer NOT NULL,
    user_id integer NOT NULL,
    token character varying(500) NOT NULL,
    device_type character varying(50),
    created_at timestamp without time zone,
    last_used timestamp without time zone,
    is_active boolean
);


--
-- Name: fcm_token_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fcm_token_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fcm_token_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fcm_token_id_seq OWNED BY public.fcm_token.id;


--
-- Name: message; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.message (
    id integer NOT NULL,
    conversation_id integer,
    sender_id integer,
    text character varying(1000),
    "timestamp" timestamp without time zone,
    file_url character varying(500),
    file_type character varying(50),
    file_name character varying(255)
);


--
-- Name: message_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.message_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: message_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.message_id_seq OWNED BY public.message.id;


--
-- Name: offline_download; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.offline_download (
    id integer NOT NULL,
    user_id integer NOT NULL,
    course_id integer NOT NULL,
    downloaded_at timestamp without time zone,
    expires_at timestamp without time zone
);


--
-- Name: offline_download_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.offline_download_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: offline_download_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.offline_download_id_seq OWNED BY public.offline_download.id;


--
-- Name: student_profile; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.student_profile (
    id integer NOT NULL,
    user_id integer NOT NULL,
    learning_style character varying(50),
    preferred_subjects text,
    skill_level character varying(50),
    learning_goals text,
    available_time character varying(50),
    preferred_languages text,
    survey_completed boolean,
    selected_goals text,
    tutor_gender_preference character varying(20),
    math_score integer,
    science_score integer,
    language_score integer,
    tech_score integer,
    motivation_level integer,
    bio text,
    weekly_study_hours character varying(20),
    preferred_session_length character varying(10),
    learning_pace character varying(20)
);


--
-- Name: student_profile_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.student_profile_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: student_profile_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.student_profile_id_seq OWNED BY public.student_profile.id;


--
-- Name: tutor_profile; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tutor_profile (
    id integer NOT NULL,
    user_id integer NOT NULL,
    expertise text,
    bio text,
    hourly_rate double precision,
    rating double precision,
    total_sessions integer,
    languages text,
    availability text,
    verified boolean,
    teaching_style character varying(50),
    years_experience character varying(10),
    education text,
    certifications text,
    specializations text,
    teaching_philosophy text,
    min_session_length character varying(10),
    max_students character varying(10),
    preferred_age_groups text
);


--
-- Name: tutor_profile_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tutor_profile_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tutor_profile_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tutor_profile_id_seq OWNED BY public.tutor_profile.id;


--
-- Name: user; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."user" (
    id integer NOT NULL,
    email character varying(120) NOT NULL,
    password_hash character varying(255) NOT NULL,
    user_type character varying(20) NOT NULL,
    full_name character varying(100) NOT NULL,
    country_code character varying(5),
    income_level character varying(50),
    phone_verified boolean,
    created_at timestamp without time zone,
    email_verified boolean,
    email_verification_token character varying(100),
    reset_password_token character varying(100),
    reset_password_expires timestamp without time zone,
    failed_login_attempts integer,
    account_locked_until timestamp without time zone,
    phone character varying(20),
    location character varying(100),
    date_of_birth date,
    gender character varying(20)
);


--
-- Name: user_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_id_seq OWNED BY public."user".id;


--
-- Name: assignment id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignment ALTER COLUMN id SET DEFAULT nextval('public.assignment_id_seq'::regclass);


--
-- Name: assignment_submission id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignment_submission ALTER COLUMN id SET DEFAULT nextval('public.assignment_submission_id_seq'::regclass);


--
-- Name: booking id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking ALTER COLUMN id SET DEFAULT nextval('public.booking_id_seq'::regclass);


--
-- Name: conversation id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation ALTER COLUMN id SET DEFAULT nextval('public.conversation_id_seq'::regclass);


--
-- Name: course id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course ALTER COLUMN id SET DEFAULT nextval('public.course_id_seq'::regclass);


--
-- Name: course_material id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_material ALTER COLUMN id SET DEFAULT nextval('public.course_material_id_seq'::regclass);


--
-- Name: course_section id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_section ALTER COLUMN id SET DEFAULT nextval('public.course_section_id_seq'::regclass);


--
-- Name: enrollment id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrollment ALTER COLUMN id SET DEFAULT nextval('public.enrollment_id_seq'::regclass);


--
-- Name: fcm_token id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fcm_token ALTER COLUMN id SET DEFAULT nextval('public.fcm_token_id_seq'::regclass);


--
-- Name: message id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message ALTER COLUMN id SET DEFAULT nextval('public.message_id_seq'::regclass);


--
-- Name: offline_download id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offline_download ALTER COLUMN id SET DEFAULT nextval('public.offline_download_id_seq'::regclass);


--
-- Name: student_profile id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_profile ALTER COLUMN id SET DEFAULT nextval('public.student_profile_id_seq'::regclass);


--
-- Name: tutor_profile id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tutor_profile ALTER COLUMN id SET DEFAULT nextval('public.tutor_profile_id_seq'::regclass);


--
-- Name: user id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."user" ALTER COLUMN id SET DEFAULT nextval('public.user_id_seq'::regclass);


--
-- Name: alembic_version alembic_version_pkc; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alembic_version
    ADD CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num);


--
-- Name: assignment assignment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignment
    ADD CONSTRAINT assignment_pkey PRIMARY KEY (id);


--
-- Name: assignment_submission assignment_submission_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignment_submission
    ADD CONSTRAINT assignment_submission_pkey PRIMARY KEY (id);


--
-- Name: booking booking_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking
    ADD CONSTRAINT booking_pkey PRIMARY KEY (id);


--
-- Name: conversation conversation_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation
    ADD CONSTRAINT conversation_pkey PRIMARY KEY (id);


--
-- Name: course_material course_material_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_material
    ADD CONSTRAINT course_material_pkey PRIMARY KEY (id);


--
-- Name: course course_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course
    ADD CONSTRAINT course_pkey PRIMARY KEY (id);


--
-- Name: course_section course_section_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_section
    ADD CONSTRAINT course_section_pkey PRIMARY KEY (id);


--
-- Name: enrollment enrollment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrollment
    ADD CONSTRAINT enrollment_pkey PRIMARY KEY (id);


--
-- Name: fcm_token fcm_token_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fcm_token
    ADD CONSTRAINT fcm_token_pkey PRIMARY KEY (id);


--
-- Name: fcm_token fcm_token_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fcm_token
    ADD CONSTRAINT fcm_token_token_key UNIQUE (token);


--
-- Name: message message_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message
    ADD CONSTRAINT message_pkey PRIMARY KEY (id);


--
-- Name: offline_download offline_download_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offline_download
    ADD CONSTRAINT offline_download_pkey PRIMARY KEY (id);


--
-- Name: student_profile student_profile_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_profile
    ADD CONSTRAINT student_profile_pkey PRIMARY KEY (id);


--
-- Name: tutor_profile tutor_profile_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tutor_profile
    ADD CONSTRAINT tutor_profile_pkey PRIMARY KEY (id);


--
-- Name: user user_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."user"
    ADD CONSTRAINT user_email_key UNIQUE (email);


--
-- Name: user user_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."user"
    ADD CONSTRAINT user_pkey PRIMARY KEY (id);


--
-- Name: assignment assignment_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignment
    ADD CONSTRAINT assignment_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.course(id);


--
-- Name: assignment_submission assignment_submission_assignment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignment_submission
    ADD CONSTRAINT assignment_submission_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES public.assignment(id);


--
-- Name: assignment_submission assignment_submission_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignment_submission
    ADD CONSTRAINT assignment_submission_student_id_fkey FOREIGN KEY (student_id) REFERENCES public."user"(id);


--
-- Name: assignment assignment_tutor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignment
    ADD CONSTRAINT assignment_tutor_id_fkey FOREIGN KEY (tutor_id) REFERENCES public.tutor_profile(id);


--
-- Name: booking booking_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking
    ADD CONSTRAINT booking_student_id_fkey FOREIGN KEY (student_id) REFERENCES public."user"(id);


--
-- Name: booking booking_tutor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking
    ADD CONSTRAINT booking_tutor_id_fkey FOREIGN KEY (tutor_id) REFERENCES public."user"(id);


--
-- Name: conversation conversation_participant1_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation
    ADD CONSTRAINT conversation_participant1_id_fkey FOREIGN KEY (participant1_id) REFERENCES public."user"(id);


--
-- Name: conversation conversation_participant2_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation
    ADD CONSTRAINT conversation_participant2_id_fkey FOREIGN KEY (participant2_id) REFERENCES public."user"(id);


--
-- Name: course_material course_material_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_material
    ADD CONSTRAINT course_material_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.course(id);


--
-- Name: course_material course_material_section_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_material
    ADD CONSTRAINT course_material_section_id_fkey FOREIGN KEY (section_id) REFERENCES public.course_section(id);


--
-- Name: course_section course_section_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_section
    ADD CONSTRAINT course_section_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.course(id);


--
-- Name: course course_tutor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course
    ADD CONSTRAINT course_tutor_id_fkey FOREIGN KEY (tutor_id) REFERENCES public.tutor_profile(id);


--
-- Name: enrollment enrollment_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrollment
    ADD CONSTRAINT enrollment_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.course(id);


--
-- Name: enrollment enrollment_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrollment
    ADD CONSTRAINT enrollment_student_id_fkey FOREIGN KEY (student_id) REFERENCES public."user"(id);


--
-- Name: fcm_token fcm_token_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fcm_token
    ADD CONSTRAINT fcm_token_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id);


--
-- Name: message message_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message
    ADD CONSTRAINT message_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversation(id);


--
-- Name: message message_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message
    ADD CONSTRAINT message_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public."user"(id);


--
-- Name: offline_download offline_download_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offline_download
    ADD CONSTRAINT offline_download_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.course(id);


--
-- Name: offline_download offline_download_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offline_download
    ADD CONSTRAINT offline_download_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id);


--
-- Name: student_profile student_profile_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_profile
    ADD CONSTRAINT student_profile_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id);


--
-- Name: tutor_profile tutor_profile_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tutor_profile
    ADD CONSTRAINT tutor_profile_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id);


--
-- PostgreSQL database dump complete
--

\unrestrict vxVEXHnnvegYhKGED4IEFfbJy4Asb15hAUmZqF8w3lHvBhnel82lvhenpDkFTOJ

