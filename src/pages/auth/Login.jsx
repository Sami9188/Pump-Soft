import React, { useState } from 'react';
import { auth, db, googleProvider } from '../../config/firebase';
import { Link, useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword, signInWithPopup } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { Form, Input, Button, Alert, Card, Divider, Typography } from 'antd';
import { GoogleOutlined, MailOutlined, LockOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleLogin = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            // Retrieve user details from Firestore
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if (userDoc.exists()) {
                console.log("User Data:", userDoc.data());
            } else {
                console.log("No user data found");
                // Create user record if it doesn't exist
                await setDoc(doc(db, "users", user.uid), {
                    email: user.email,
                    uid: user.uid,
                    role: ["user"],
                    createdAt: serverTimestamp()
                });
            }

            navigate('/dashboard'); // Redirect after login
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleLogin = async () => {
        setLoading(true);
        try {
            const userCredential = await signInWithPopup(auth, googleProvider);
            const user = userCredential.user;

            // Retrieve user details from Firestore
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if (userDoc.exists()) {
                console.log("User Data:", userDoc.data());
            } else {
                console.log("No user data found");
                // Create user record if it doesn't exist
                await setDoc(doc(db, "users", user.uid), {
                    name: user.displayName,
                    email: user.email,
                    uid: user.uid,
                    role: ["student"],
                    createdAt: serverTimestamp()
                });
            }

            navigate('/dashboard');
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="container mt-5">
            <div className="row justify-content-center">
                <div className="col-md-5">
                    <Card className="shadow-sm" variant={false}>
                        <Title level={2} className="text-center mb-4">Welcome Back</Title>

                        {error && <Alert message={error} type="error" showIcon className="mb-3" />}

                        <Form layout="vertical" onSubmit={handleLogin}>
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
                                    placeholder="Enter your password"
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
                                    onClick={handleLogin}
                                    loading={loading}
                                    block
                                >
                                    Log In
                                </Button>
                            </Form.Item>

                        </Form>

                    </Card>
                </div>
            </div>
        </div>
    );
}