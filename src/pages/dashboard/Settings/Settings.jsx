import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
    Form,
    Input,
    Button,
    Upload,
    message,
    Spin,
    Card,
    Typography,
    Tooltip,
    Progress,
    Space,
    theme
} from 'antd';
import {
    SaveOutlined,
    LoadingOutlined,
    InfoCircleOutlined,
    CloudUploadOutlined,
    PictureOutlined,
    CheckCircleFilled
} from '@ant-design/icons';
import { useSettings } from '../../../context/SettingsContext';

const { Title, Text } = Typography;
const { useToken } = theme;

const WebsiteSettings = () => {
    const [form] = Form.useForm();
    const { token } = useToken();
    const { settings, loading, updateSettings } = useSettings();

    // State for open sidebar logo
    const [openImageUrl, setOpenImageUrl] = useState(null);
    const [openImageLoading, setOpenImageLoading] = useState(false);
    const [openUploadProgress, setOpenUploadProgress] = useState(0);

    // State for collapsed sidebar logo
    const [collapsedImageUrl, setCollapsedImageUrl] = useState(null);
    const [collapsedImageLoading, setCollapsedImageLoading] = useState(false);
    const [collapsedUploadProgress, setCollapsedUploadProgress] = useState(0);

    const [saveLoading, setSaveLoading] = useState(false);
    const [isDragging, setIsDragging] = useState(false);

    // Populate form and image states when settings are loaded
    useEffect(() => {
        if (settings) {
            form.setFieldsValue({
                websiteName: settings.name,
                darkMode: settings.darkMode || false,
                location: settings.location,
                companyPhone: settings.companyPhone,
            });
            setOpenImageUrl(settings.logoUrl);
            setCollapsedImageUrl(settings.collapsedLogoUrl);
        }
    }, [settings, form]);

    // Upload function for open sidebar logo
    const handleOpenUpload = async (file) => {
        if (file.size > 2 * 1024 * 1024) {
            message.error('File size must be less than 2MB');
            return false;
        }
        if (!file.type.startsWith('image/')) {
            message.error('You can only upload image files');
            return false;
        }
        setOpenImageLoading(true);
        setOpenUploadProgress(0);

        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', import.meta.env.VITE_CLOUDINARY_PRESET);

        try {
            const response = await axios.post(
                `https://api.cloudinary.com/v1_1/${import.meta.env.VITE_CLOUDINARY_CLOUD_NAME}/image/upload`,
                formData,
                {
                    onUploadProgress: (progressEvent) => {
                        const percent = Math.floor((progressEvent.loaded * 100) / progressEvent.total);
                        setOpenUploadProgress(percent);
                    }
                }
            );
            setOpenImageUrl(response.data.secure_url);
            message.success({
                content: 'Open logo uploaded successfully',
                icon: <CheckCircleFilled style={{ color: token.colorSuccess }} />
            });
        } catch (error) {
            console.error('Error uploading open logo:', error);
            message.error('Failed to upload open logo');
        } finally {
            setOpenImageLoading(false);
        }
        return false;
    };

    // Upload function for collapsed sidebar logo
    const handleCollapsedUpload = async (file) => {
        if (file.size > 2 * 1024 * 1024) {
            message.error('File size must be less than 2MB');
            return false;
        }
        if (!file.type.startsWith('image/')) {
            message.error('You can only upload image files');
            return false;
        }
        setCollapsedImageLoading(true);
        setCollapsedUploadProgress(0);

        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', import.meta.env.VITE_CLOUDINARY_PRESET);

        try {
            const response = await axios.post(
                `https://api.cloudinary.com/v1_1/${import.meta.env.VITE_CLOUDINARY_CLOUD_NAME}/image/upload`,
                formData,
                {
                    onUploadProgress: (progressEvent) => {
                        const percent = Math.floor((progressEvent.loaded * 100) / progressEvent.total);
                        setCollapsedUploadProgress(percent);
                    }
                }
            );
            setCollapsedImageUrl(response.data.secure_url);
            message.success({
                content: 'Collapsed logo uploaded successfully',
                icon: <CheckCircleFilled style={{ color: token.colorSuccess }} />
            });
        } catch (error) {
            console.error('Error uploading collapsed logo:', error);
            message.error('Failed to upload collapsed logo');
        } finally {
            setCollapsedImageLoading(false);
        }
        return false;
    };

    // Render a unified upload area using Bootstrap classes and AntD components
    const renderUploadArea = (imageUrl, loadingState, uploadProgress, onUpload, label) => (
        <Upload
            listType="picture"
            showUploadList={false}
            beforeUpload={onUpload}
            disabled={loadingState}
            accept="image/png,image/jpeg,image/svg+xml"
        >
            <div className="position-relative rounded border p-3 overflow-hidden" style={{ height: '160px' }}>
                {imageUrl ? (
                    <img
                        src={imageUrl}
                        alt="Uploaded logo"
                        className="w-100"
                        style={{ maxHeight: '140px', objectFit: 'contain', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}
                    />
                ) : (
                    <div className="d-flex flex-column justify-content-center align-items-center p-4 rounded border" style={{ height: '160px', cursor: 'pointer' }}>
                        <CloudUploadOutlined className="mb-2" style={{ fontSize: '36px', color: token.colorPrimary }} />
                        <Text strong>{label}</Text>
                        <Text className="mt-1 text-muted">Or click to browse files</Text>
                    </div>
                )}
                <div className="position-absolute top-0 start-0 end-0 bottom-0 d-flex justify-content-center align-items-center rounded" style={{ background: 'rgba(0,0,0,0.5)', opacity: 0, transition: 'opacity 0.2s' }}>
                    <Text className="text-white fw-bold">Click to change logo</Text>
                </div>
                {loadingState && (
                    <div className="position-absolute top-0 start-0 end-0 bottom-0 d-flex flex-column justify-content-center align-items-center rounded" style={{ backgroundColor: 'rgba(255,255,255,0.9)' }}>
                        <LoadingOutlined style={{ fontSize: '24px', color: token.colorPrimary }} />
                        <Text className="mt-2 mb-2 fw-bold">Uploading... {uploadProgress}%</Text>
                        <Progress percent={uploadProgress} status="active" className="w-75" strokeColor={token.colorPrimary} />
                    </div>
                )}
            </div>
        </Upload>
    );

    // Handle form submission to update images and other settings
    const onFinish = async (values) => {
        if (!openImageUrl || !collapsedImageUrl) {
            message.warning({
                content: 'Please upload both logos before saving settings',
                icon: <InfoCircleOutlined style={{ color: token.colorWarning }} />
            });
            return;
        }
        setSaveLoading(true);
        try {
            await updateSettings({
                name: values.websiteName,
                logoUrl: openImageUrl,
                collapsedLogoUrl: collapsedImageUrl,
                darkMode: values.darkMode || false,
                location: values.location,
                companyPhone: values.companyPhone,
            });
        } catch (error) {
            console.error('Error saving settings:', error);
            message.error('Failed to save settings');
        } finally {
            setSaveLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="d-flex flex-column justify-content-center align-items-center vh-80">
                <Spin size="large" />
                <Text className="mt-3 text-secondary">Loading settings...</Text>
            </div>
        );
    }

    return (
        <div className="container my-4" style={{ animation: 'fadeIn 0.3s ease-in-out' }}>
            <style>
                {`
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}
            </style>
            <Card className="shadow-sm rounded">
                <div className="d-flex align-items-center mb-3">
                    <Title level={4} className="mb-0">Website Configuration</Title>
                    <Text className="ms-2 text-muted">Customize how your website appears to users</Text>
                </div>
                <Form
                    form={form}
                    layout="vertical"
                    onFinish={onFinish}
                    requiredMark="optional"
                    initialValues={{ darkMode: false }}
                >
                    <Space direction="vertical" className="w-100" size="large">
                        <div className="row">
                            <div className="col-md-4">
                                <Form.Item
                                    name="websiteName"
                                    label="Website Name"
                                    rules={[{ required: true, message: 'Please enter website name' }]}
                                    tooltip="This will appear in the browser title bar and various places on your site"
                                >
                                    <Input
                                        placeholder="Enter website name"
                                        size="large"
                                        prefix={<Text className="me-2 text-muted">Name:</Text>}
                                    />
                                </Form.Item>
                            </div>
                            <div className="col-md-4">
                                <Form.Item
                                    name="location"
                                    label="Location"
                                    rules={[{ required: true, message: 'Please enter location' }]}
                                >
                                    <Input placeholder="Enter location" size="large" />
                                </Form.Item>
                            </div>
                            <div className="col-md-4">
                                <Form.Item
                                    name="companyPhone"
                                    label="Company Phone"
                                    rules={[{ required: true, message: 'Please enter company phone' }]}
                                >
                                    <Input placeholder="Enter company phone" size="large" />
                                </Form.Item>
                            </div>
                        </div>

                        <Card size="small" className="mb-3" bodyStyle={{ padding: '1rem' }}>
                            <div className="mb-3">
                                <div className="d-flex align-items-center mb-2">
                                    <PictureOutlined className="me-2" style={{ color: token.colorPrimary }} />
                                    <Text strong>Open Sidebar Logo</Text>
                                </div>
                                {renderUploadArea(openImageUrl, openImageLoading, openUploadProgress, handleOpenUpload, 'Drag and drop open logo')}
                            </div>
                            <div>
                                <div className="d-flex align-items-center mb-2">
                                    <PictureOutlined className="me-2" style={{ color: token.colorPrimary }} />
                                    <Text strong>Collapsed Sidebar Logo</Text>
                                </div>
                                {renderUploadArea(collapsedImageUrl, collapsedImageLoading, collapsedUploadProgress, handleCollapsedUpload, 'Drag and drop collapsed logo')}
                            </div>
                            <div className="d-flex align-items-center mt-2">
                                <InfoCircleOutlined style={{ color: token.colorTextSecondary }} />
                                <Text className="ms-2 text-muted">
                                    Recommended size: 200px × 60px, PNG or JPG (max 2MB)
                                </Text>
                            </div>
                        </Card>

                        <Form.Item className="d-flex justify-content-center align-items-center">
                            <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saveLoading} size="large" className="w-100 py-2">
                                Save Settings
                            </Button>
                        </Form.Item>
                    </Space>
                </Form>
            </Card>
        </div>
    );
};

export default WebsiteSettings;