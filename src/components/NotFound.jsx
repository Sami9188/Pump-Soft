import React from 'react';
import { Result, Button } from 'antd';

const NotFound = () => {
    return (
        <div className="container d-flex align-items-center justify-content-center vh-100">
            <Result
                status="404"
                title="404"
                subTitle="Sorry, the page you visited does not exist."
                extra={
                    <Button type="primary" className="btn btn-primary" href="/">
                        Back Home
                    </Button>
                }
            />
        </div>
    );
};

export default NotFound;
