import React, { useState } from 'react';
import { auth, db, googleProvider } from '../../config/firebase';
import { Link, useNavigate } from 'react-router-dom';
import { createUserWithEmailAndPassword, signInWithPopup } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { Form, Input, Button, Alert, Card, Divider, Typography } from 'antd';
import { GoogleOutlined, UserOutlined, LockOutlined, MailOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

export default function SignUp() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState(''); // Added missing name state
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const handleSignUp = async (e) => {
        e.preventDefault();
        setError('');
        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            // Store user details in Firestore
            await setDoc(doc(db, "users", user.uid), {
                name: name, // Using the name state
                email: email,
                uid: user.uid,
                role: ["seller"],
                createdAt: serverTimestamp()
            });

            navigate('/dashboard'); // Redirect after signup
        } catch (err) {
            setError(err.message);
        }
    };

    const handleGoogleSignUp = async () => {
        try {
            const userCredential = await signInWithPopup(auth, googleProvider);
            const user = userCredential.user;

            // Store user details in Firestore
            await setDoc(doc(db, "users", user.uid), {
                name: user.displayName,
                email: user.email,
                uid: user.uid,
                role: ["seller"],
                createdAt: serverTimestamp()
            }, { merge: true }); // Using merge option to avoid overwriting

            navigate('/dashboard');
        } catch (err) {
            setError(err.message);
        }
    };

    return (
        <div className="container mt-5">
            <div className="row justify-content-center">
                <div className="col-md-5">
                    <Card className="shadow-sm" variant={false}>
                        <Title level={2} className="text-center mb-4">Create Account</Title>

                        {error && <Alert message={error} type="error" showIcon className="mb-3" />}

                        <Form layout="vertical" onSubmit={handleSignUp}>
                            <Form.Item label="Full Name" required>
                                <Input
                                    prefix={<UserOutlined className="site-form-item-icon" />}
                                    size="large"
                                    placeholder="Enter your name"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    required
                                />
                            </Form.Item>

                            <Form.Item label="Email Address" required>
                                <Input
                                    prefix={<MailOutlined className="site-form-item-icon" />}
                                    size="large"
                                    type="email"
                                    placeholder="Enter your email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                />
                            </Form.Item>

                            <Form.Item label="Password" required>
                                <Input.Password
                                    prefix={<LockOutlined className="site-form-item-icon" />}
                                    size="large"
                                    placeholder="Create a password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                />
                            </Form.Item>

                            <Form.Item>
                                <Button
                                    type="primary"
                                    size="large"
                                    className="w-100"
                                    onClick={handleSignUp}
                                    block
                                >
                                    Sign Up
                                </Button>
                            </Form.Item>

                            <Divider plain>or</Divider>

                            <Button
                                icon={<GoogleOutlined />}
                                size="large"
                                danger
                                className="w-100"
                                onClick={handleGoogleSignUp}
                                block
                            >
                                Continue with Google
                            </Button>
                        </Form>

                        <div className="mt-4 text-center">
                            <Text>Already have an account? </Text>
                            <Link to="/auth/login" className="fw-bold">Log in</Link>
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
}